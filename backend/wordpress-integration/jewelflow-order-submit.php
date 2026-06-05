<?php
/**
 * JewelFlow Order Submission Integration
 *
 * Add this to your WordPress theme's functions.php
 * or as a standalone plugin file.
 *
 * This hooks into your custom order form submission
 * and forwards it to the JewelFlow portal API.
 */

// ── CONFIGURATION ─────────────────────────────────────────────────────────
// Set these in wp-config.php for security:
//   define('JEWELFLOW_API_URL', 'https://your-backend.com');
//   define('JEWELFLOW_API_KEY', 'KiRa@WebForm#2026!');

if (!defined('JEWELFLOW_API_URL')) {
    define('JEWELFLOW_API_URL', 'http://localhost:4000'); // change to your backend URL
}
if (!defined('JEWELFLOW_API_KEY')) {
    define('JEWELFLOW_API_KEY', 'KiRa@WebForm#2026!'); // must match WORDPRESS_API_KEY in .env
}

// ── MAIN FUNCTION: Submit order to JewelFlow ──────────────────────────────
/**
 * Call this function from your form handler.
 *
 * @param array  $form_data   Associative array of form field values
 * @param array  $files       Array of file info from $_FILES (optional)
 * @return array { success: bool, orderRef: string, message: string }
 *
 * Example usage:
 *   $result = jewelflow_submit_order($_POST, $_FILES['attachments'] ?? []);
 *   if ($result['success']) {
 *       echo "Order " . $result['orderRef'] . " received!";
 *   }
 */
function jewelflow_submit_order(array $form_data, array $files = []): array {

    $api_url = JEWELFLOW_API_URL . '/api/v1/public/orders';
    $api_key = JEWELFLOW_API_KEY;

    // ── Build multipart form body ──────────────────────────────────────
    $boundary = '----JewelFlowBoundary' . uniqid();

    $body = '';

    // Helper: add a text field to the multipart body
    $add_field = function(string $name, ?string $value) use (&$body, $boundary) {
        if ($value === null || $value === '') return;
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"{$name}\"\r\n\r\n";
        $body .= $value . "\r\n";
    };

    // Map your form fields → JewelFlow fields
    // Adjust the keys to match YOUR form's field names
    $add_field('firstName',     sanitize_text_field($form_data['first_name']     ?? $form_data['firstName']     ?? ''));
    $add_field('lastName',      sanitize_text_field($form_data['last_name']      ?? $form_data['lastName']      ?? ''));
    $add_field('storeName',     sanitize_text_field($form_data['company_name']   ?? $form_data['storeName']     ?? $form_data['company'] ?? ''));
    $add_field('email',         sanitize_email($form_data['email']               ?? ''));
    $add_field('phoneNumber',   sanitize_text_field($form_data['phone']          ?? $form_data['phone_number']  ?? ''));
    $add_field('orderType',     sanitize_text_field($form_data['type']           ?? $form_data['orderType']     ?? ''));
    $add_field('size',          sanitize_text_field($form_data['size']           ?? ''));
    $add_field('metalType',     sanitize_text_field($form_data['metal_type']     ?? $form_data['metalType']     ?? ''));
    $add_field('metalColor',    sanitize_text_field($form_data['metal_color']    ?? $form_data['metalColor']    ?? ''));
    $add_field('diamondQuality',sanitize_text_field($form_data['diamond_quality']?? $form_data['diamondQuality']?? ''));
    $add_field('centerStoneShape', sanitize_text_field($form_data['stone_shape'] ?? $form_data['centerStoneShape'] ?? ''));
    $add_field('referenceWeblink', esc_url_raw($form_data['reference_url']       ?? $form_data['referenceWeblink'] ?? ''));
    $add_field('refCustomerPo', sanitize_text_field($form_data['customer_po']    ?? $form_data['po_number']     ?? ''));
    $add_field('stockNumber',   sanitize_text_field($form_data['stock_no']       ?? $form_data['stockNumber']   ?? ''));
    $add_field('customerNotes', sanitize_textarea_field($form_data['comments']   ?? $form_data['customerNotes'] ?? ''));

    // ── Attach files (images, PDFs) ────────────────────────────────────
    // $files = $_FILES['attachments'] or similar — supports single or multiple
    $file_list = [];
    if (!empty($files['name'])) {
        if (is_array($files['name'])) {
            // Multiple files: <input type="file" name="files[]" multiple>
            for ($i = 0; $i < count($files['name']); $i++) {
                if ($files['error'][$i] === UPLOAD_ERR_OK) {
                    $file_list[] = [
                        'tmp_name' => $files['tmp_name'][$i],
                        'name'     => $files['name'][$i],
                        'type'     => $files['type'][$i],
                    ];
                }
            }
        } else {
            // Single file: <input type="file" name="files">
            if ($files['error'] === UPLOAD_ERR_OK) {
                $file_list[] = [
                    'tmp_name' => $files['tmp_name'],
                    'name'     => $files['name'],
                    'type'     => $files['type'],
                ];
            }
        }
    }

    foreach ($file_list as $file) {
        $file_content = file_get_contents($file['tmp_name']);
        if ($file_content === false) continue;
        $filename = basename($file['name']);
        $mime     = $file['type'] ?: 'application/octet-stream';
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"files\"; filename=\"{$filename}\"\r\n";
        $body .= "Content-Type: {$mime}\r\n\r\n";
        $body .= $file_content . "\r\n";
    }

    $body .= "--{$boundary}--\r\n";

    // ── Send to JewelFlow API ──────────────────────────────────────────
    $response = wp_remote_post($api_url, [
        'method'  => 'POST',
        'timeout' => 30,
        'headers' => [
            'x-api-key'    => $api_key,
            'Content-Type' => "multipart/form-data; boundary={$boundary}",
        ],
        'body'    => $body,
    ]);

    // ── Handle response ────────────────────────────────────────────────
    if (is_wp_error($response)) {
        error_log('JewelFlow API error: ' . $response->get_error_message());
        return [
            'success'  => false,
            'orderRef' => '',
            'message'  => 'Could not connect to order system. Please try again or contact us.',
        ];
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body_raw    = wp_remote_retrieve_body($response);
    $data        = json_decode($body_raw, true);

    if ($status_code === 201 || $status_code === 200) {
        return [
            'success'  => $data['success']  ?? true,
            'orderRef' => $data['orderRef'] ?? '',
            'message'  => $data['message']  ?? 'Order received successfully!',
        ];
    }

    error_log("JewelFlow API returned {$status_code}: {$body_raw}");
    return [
        'success'  => false,
        'orderRef' => '',
        'message'  => 'Order submission failed. Please try again.',
    ];
}


// ── EXAMPLE: Hook into your form's submit action ───────────────────────────
// Replace 'your_form_submit_action' with whatever action your form uses.
// Example: add_action('init', 'handle_jewelry_order_form');

function handle_jewelry_order_form() {
    // Only run on POST with our form's nonce
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
    if (empty($_POST['jewelry_order_nonce']))    return;
    if (!wp_verify_nonce($_POST['jewelry_order_nonce'], 'jewelry_order_submit')) return;

    $files = $_FILES['files'] ?? [];
    $result = jewelflow_submit_order($_POST, $files);

    if ($result['success']) {
        // Redirect to success page with order ref
        $redirect = add_query_arg([
            'order_submitted' => '1',
            'order_ref'       => urlencode($result['orderRef']),
        ], wp_get_referer());
        wp_redirect($redirect);
        exit;
    } else {
        // Redirect back with error
        $redirect = add_query_arg('order_error', '1', wp_get_referer());
        wp_redirect($redirect);
        exit;
    }
}
add_action('init', 'handle_jewelry_order_form');


// ── EXAMPLE: Show success/error message on the page ───────────────────────
function jewelry_order_notices() {
    if (!empty($_GET['order_submitted'])) {
        $ref = esc_html(urldecode($_GET['order_ref'] ?? ''));
        echo '<div class="order-success-notice">';
        echo "<strong>Thank you! Your order <em>{$ref}</em> has been received.</strong> ";
        echo "Our team will contact you within 24 hours.";
        echo '</div>';
    }
    if (!empty($_GET['order_error'])) {
        echo '<div class="order-error-notice">';
        echo 'Something went wrong. Please try again or call us.';
        echo '</div>';
    }
}
// add_shortcode('jewelry_order_notices', 'jewelry_order_notices');
