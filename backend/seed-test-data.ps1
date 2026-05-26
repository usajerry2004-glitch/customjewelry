# JewelFlow OS — Realistic Test Data Seed
# 20 customers, 30 orders, CAD files, conversations
$API = "http://localhost:4000/api/v1"
$PG  = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$env:PGPASSWORD = "jewelflow123"
function psql($sql) { & $PG -U jewelflow -d jewelflow -c $sql 2>&1 | Out-Null }
function psqlq($sql) { & $PG -U jewelflow -d jewelflow -t -A -c $sql 2>&1 }

Write-Host "Logging in as admin..."
$login = Invoke-RestMethod -Uri "$API/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@kirajewels.one","password":"admin123"}'
$h = @{ Authorization = "Bearer $($login.access_token)" }

# ─── STAFF IDs ───────────────────────────────────────────────────────────────
$ADMIN_ID   = "8fb73df7-85f2-4733-838e-5f65c1e01580"
$AUTH_ID    = "41c8433b-4b73-4a94-8102-0bd87da8ce8a"
$CAD_ID     = "1e495f96-ea5e-4e3e-a5f5-98ca50066582"
$SKU_ID     = "0dda2cc0-04d3-4e66-ac4f-4645c6bcc74d"
$FACTORY_ID = "75f6d089-b7b9-464f-bb4e-92c14a24d8dd"
$SHIP_ID    = "04031c58-7576-4757-92b0-21149219c122"
$SALES_ID   = "6456ebcc-53bb-4b78-a714-3fda1c5c50d0"

# ─── CREATE 20 CUSTOMERS ─────────────────────────────────────────────────────
$customers = @(
  @{ firstName="James"; lastName="Sullivan";  email="james@diamondcollectionnyc.com";  store="Diamond Collection NYC" },
  @{ firstName="Priya"; lastName="Mehta";     email="priya@sunrisejewelers.com";        store="Sunrise Jewelers" },
  @{ firstName="Carlos";lastName="Reyes";     email="carlos@goldworkshop.com";          store="The Gold Workshop" },
  @{ firstName="Sofia"; lastName="Chen";      email="sofia@pearlsandgems.com";          store="Pearls & Gems Studio" },
  @{ firstName="David"; lastName="Kim";       email="david@crownjewelers.com";          store="Crown Jewelers" },
  @{ firstName="Rachel";lastName="Morris";    email="rachel@heritagegems.com";          store="Heritage Gems" },
  @{ firstName="Ethan"; lastName="Brooks";    email="ethan@modernsparkle.com";          store="Modern Sparkle Co." },
  @{ firstName="Nia";   lastName="Thompson";  email="nia@coastaldiamonds.com";          store="Coastal Diamonds" },
  @{ firstName="Ahmed"; lastName="Hassan";    email="ahmed@rockymtngems.com";           store="Rocky Mountain Gems" },
  @{ firstName="Laura"; lastName="Fitzgerald";email="laura@elitejewelrystudio.com";    store="Elite Jewelry Studio" },
  @{ firstName="Marco"; lastName="Ferretti";  email="marco@silverandstone.com";         store="Silver & Stone" },
  @{ firstName="Yuki";  lastName="Nakamura";  email="yuki@timelesspieces.com";          store="Timeless Pieces" },
  @{ firstName="Brianna";lastName="Clark";    email="brianna@theringvault.com";         store="The Ring Vault" },
  @{ firstName="Nathan";lastName="Patel";     email="nathan@stellarjewels.com";         store="Stellar Jewels" },
  @{ firstName="Diane"; lastName="Leblanc";   email="diane@artisangoldworks.com";       store="Artisan Gold Works" },
  @{ firstName="Kevin"; lastName="Osei";      email="kevin@premiergems.com";            store="Premier Gems Inc." },
  @{ firstName="Alicia";lastName="Vega";      email="alicia@diamonddistrict.com";       store="Diamond District Co." },
  @{ firstName="Ben";   lastName="Hartley";   email="ben@luxejewelers.com";             store="Luxe Jewelers" },
  @{ firstName="Fatima";lastName="Al-Rashid"; email="fatima@serenityfine.com";          store="Serenity Fine Jewelry" },
  @{ firstName="Tyler"; lastName="Wade";      email="tyler@vantagejewelry.com";         store="Vantage Jewelry" }
)

$custIds = @{}
Write-Host "Creating 20 customers..."
foreach ($c in $customers) {
  $body = @{ firstName=$c.firstName; lastName=$c.lastName; email=$c.email; password="test123"; role="CUSTOMER" } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$API/users" -Method POST -Headers $h -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue
  if ($res.id) { $custIds[$c.email] = $res.id; Write-Host "  + $($c.store)" }
  else { Write-Host "  ! Skipped $($c.store) (exists)" }
}

# Re-fetch to ensure IDs for all customers (including skipped)
$allCusts = Invoke-RestMethod -Uri "$API/users?role=CUSTOMER" -Headers $h
foreach ($c in $allCusts) { if (-not $custIds[$c.email]) { $custIds[$c.email] = $c.id } }
$cList = $allCusts | Where-Object { ($customers | ForEach-Object {$_.email}) -contains $_.email }

function cid($idx) { $custIds[$customers[$idx].email] }
function cemail($idx) { $customers[$idx].email }
function cname($idx) { "$($customers[$idx].firstName) $($customers[$idx].lastName)" }
function cstore($idx) { $customers[$idx].store }

# ─── CREATE 30 ORDERS ────────────────────────────────────────────────────────
Write-Host "`nCreating 30 orders..."

$orders = @(
  # WAITING_CONFIRMATION (3)
  @{ po="KJ-TEST-001"; status="WAITING_CONFIRMATION"; ci=0;  type="Ring";    metal="18K"; color="WG-White";          shape="Oval";    carat="1.20"; quality="VS1-G";   cost=1850; notes="Customer wants a classic oval solitaire. Thin band, 4-prong head. She'd like to see a few head style options in the CAD." },
  @{ po="KJ-TEST-002"; status="WAITING_CONFIRMATION"; ci=1;  type="Pendant"; metal="14K"; color="YG-Yellow";         shape="Round";   carat="0.75"; quality="SI1-H";   cost=920;  notes="Simple bezel-set round pendant for everyday wear. No chain needed — just the pendant." },
  @{ po="KJ-TEST-003"; status="WAITING_CONFIRMATION"; ci=2;  type="Earrings";metal="18K"; color="RG-Rose";           shape="Cushion"; carat="0.50"; quality="VS2-F";   cost=1400; notes="Matching cushion studs. Customer wants a low basket setting. Ref: sent Instagram DM with inspiration photo." },

  # PENDING_CAD (3)
  @{ po="KJ-TEST-004"; status="PENDING_CAD"; ci=3;  type="Ring";    metal="14K"; color="WG-White";          shape="Emerald"; carat="1.50"; quality="F+VS+";   cost=2200; notes="East-west emerald solitaire. Sleek knife-edge shank, no side stones." },
  @{ po="KJ-TEST-005"; status="PENDING_CAD"; ci=4;  type="Pendant"; metal="18K"; color="WY-White & Yellow"; shape="Pear";    carat="0.90"; quality="VVS2-E";  cost=1750; notes="Pear pendant with hidden halo. Yellow gold frame, white gold prongs. Customer wants a delicate chain loop." },
  @{ po="KJ-TEST-006"; status="PENDING_CAD"; ci=5;  type="Ring";    metal="14K"; color="RG-Rose";           shape="Round";   carat="1.00"; quality="VS1-G";   cost=1600; notes="Three-stone ring — 1ct center, 0.30ct each side. Classic cathedral shank." },

  # CAD_IN_PROGRESS (3)
  @{ po="KJ-TEST-007"; status="CAD_IN_PROGRESS"; ci=6;  type="Ring";     metal="18K"; color="WG-White"; shape="Radiant"; carat="1.75"; quality="VS1-F";  cost=2950; notes="Radiant halo ring. Shared-prong micropave halo and down the shank both sides. Thin 1.8mm band." },
  @{ po="KJ-TEST-008"; status="CAD_IN_PROGRESS"; ci=7;  type="Bracelet"; metal="14K"; color="YG-Yellow"; shape="Round";   carat="2.00"; quality="SI1-G";  cost=3100; notes="Tennis bracelet, 7 inches. 4-prong round diamonds. Want them to look like classic Tiffany style spacing." },
  @{ po="KJ-TEST-009"; status="CAD_IN_PROGRESS"; ci=8;  type="Ring";     metal="18K"; color="WG-White"; shape="Princess";carat="1.25"; quality="VVS1-D"; cost=3400; notes="Princess solitaire, high cathedral. Very classic and clean, no additional diamonds. 2mm band width." },

  # CUSTOMER_APPROVED (3)
  @{ po="KJ-TEST-010"; status="CUSTOMER_APPROVED"; ci=9;  type="Ring";    metal="14K"; color="WG-White";  shape="Oval";    carat="1.50"; quality="VS2-G";   cost=2100; notes="Oval hidden halo with split shank. Customer approved design on 2nd revision." },
  @{ po="KJ-TEST-011"; status="CUSTOMER_APPROVED"; ci=10; type="Pendant"; metal="18K"; color="WG-White";  shape="Round";   carat="1.00"; quality="VVS2-F";  cost=1900; notes="Bezel pendant with fine pave border. Customer loved the CAD, approved first time." },
  @{ po="KJ-TEST-012"; status="CUSTOMER_APPROVED"; ci=11; type="Ring";    metal="14K"; color="Two-Tone";  shape="Cushion"; carat="2.00"; quality="VS1-F";   cost=3800; notes="Cushion halo, yellow gold basket, white gold halo and shank. Approved after 1 minor tweak." },

  # CUSTOMER_REJECTED (2)
  @{ po="KJ-TEST-013"; status="CUSTOMER_REJECTED"; ci=12; type="Ring";    metal="14K"; color="YG-Yellow"; shape="Round";   carat="0.80"; quality="SI1-H";   cost=1100; notes="Customer rejected the halo design, wants to switch to a solitaire. Will resubmit after internal discussion." },
  @{ po="KJ-TEST-014"; status="CUSTOMER_REJECTED"; ci=13; type="Earrings";metal="18K"; color="WG-White"; shape="Pear";    carat="0.60"; quality="VS2-G";   cost=1650; notes="Pear drop earrings. Customer rejected — prong placement looked off in render. Needs CAD revision." },

  # SKU_CREATION (2)
  @{ po="KJ-TEST-015"; status="SKU_CREATION"; ci=14; type="Ring";    metal="18K"; color="WG-White";          shape="Oval";   carat="1.80"; quality="VVS1-E"; cost=3200; sku="CJ01015-18W"; notes="Oval micropave band. Ready for SKU assignment." },
  @{ po="KJ-TEST-016"; status="SKU_CREATION"; ci=15; type="Pendant"; metal="14K"; color="RG-Rose";            shape="Heart";  carat="0.50"; quality="VS1-G";  cost=850;  sku="CJ01016-14R"; notes="Heart pendant, prong set. Customer initials to be engraved on back." },

  # VPO_ISSUED (2)
  @{ po="KJ-TEST-017"; status="VPO_ISSUED"; ci=16; type="Ring";    metal="14K"; color="WG-White"; shape="Round"; carat="1.00"; quality="VS2-G"; cost=1700; sku="CJ01017-14W"; vpo="VPO-40291"; jb="JB-40291"; vendor="Creations"; notes="Solitaire prong ring. VPO issued to Creations factory." },
  @{ po="KJ-TEST-018"; status="VPO_ISSUED"; ci=17; type="Pendant"; metal="18K"; color="YG-Yellow"; shape="Oval"; carat="0.75"; quality="VS1-F"; cost=1350; sku="CJ01018-18Y"; vpo="VPO-40292"; jb="JB-40292"; vendor="Creations"; notes="Oval bezel pendant. Factory confirmed receipt of VPO." },

  # ORDER_JOB_BAG_CREATED (2)
  @{ po="KJ-TEST-019"; status="ORDER_JOB_BAG_CREATED"; ci=18; type="Ring";    metal="18K"; color="WG-White"; shape="Cushion"; carat="2.50"; quality="VVS2-E"; cost=5200; sku="CJ01019-18W"; vpo="VPO-40280"; jb="JB-40280"; vendor="Creations"; notes="Cushion halo, major piece. Job bag created, in production." },
  @{ po="KJ-TEST-020"; status="ORDER_JOB_BAG_CREATED"; ci=19; type="Bracelet";metal="14K"; color="YG-Yellow"; shape="Round"; carat="3.00"; quality="SI1-G"; cost=4100; sku="CJ01020-14Y"; vpo="VPO-40281"; jb="JB-40281"; vendor="RC Factory"; notes="Tennis bracelet production started. Expected completion in 10 days." },

  # READY_TO_INVOICE (2)
  @{ po="KJ-TEST-021"; status="READY_TO_INVOICE"; ci=0;  type="Ring";    metal="14K"; color="WG-White"; shape="Marquise"; carat="1.10"; quality="VS1-F"; cost=1950; sku="CJ01021-14W"; tracking=""; notes="Marquise solitaire. Ready to invoice, awaiting final QC sign-off." },
  @{ po="KJ-TEST-022"; status="READY_TO_INVOICE"; ci=1;  type="Earrings";metal="18K"; color="WG-White"; shape="Round";   carat="1.00"; quality="VVS2-F"; cost=2800; sku="CJ01022-18W"; tracking=""; notes="Diamond stud earrings, 4-prong basket. Both pieces match perfectly." },

  # READY_TO_SHIP (3)
  @{ po="KJ-TEST-023"; status="READY_TO_SHIP"; ci=2;  type="Ring";    metal="18K"; color="WY-White & Yellow"; shape="Pear";    carat="1.30"; quality="VS2-G"; cost=2400; sku="CJ01023-18WY"; tracking=""; notes="Pear solitaire two-tone. Packaged and ready for dispatch." },
  @{ po="KJ-TEST-024"; status="READY_TO_SHIP"; ci=3;  type="Pendant"; metal="14K"; color="WG-White";          shape="Oval";    carat="0.85"; quality="VS1-H"; cost=1200; sku="CJ01024-14W"; tracking=""; notes="Oval bezel pendant with diamond halo. Appraisal certificate included." },
  @{ po="KJ-TEST-025"; status="READY_TO_SHIP"; ci=4;  type="Ring";    metal="14K"; color="RG-Rose";           shape="Round";   carat="0.90"; quality="SI1-G"; cost=1450; sku="CJ01025-14R"; tracking=""; notes="Rose gold solitaire. Ring box and cert packed." },

  # SHIPPED (3)
  @{ po="KJ-TEST-026"; status="SHIPPED"; ci=5;  type="Ring";    metal="18K"; color="WG-White"; shape="Oval";    carat="1.60"; quality="VS1-F"; cost=2750; sku="CJ01026-18W"; tracking="77312940298410"; shipMethod="FedEx"; notes="Shipped via FedEx overnight. ETA 2 business days." },
  @{ po="KJ-TEST-027"; status="SHIPPED"; ci=6;  type="Pendant"; metal="14K"; color="YG-Yellow"; shape="Round";  carat="0.70"; quality="VS2-G"; cost=980;  sku="CJ01027-14Y"; tracking="1Z9V39W40394830428"; shipMethod="UPS"; notes="UPS ground, 5-day delivery." },
  @{ po="KJ-TEST-028"; status="SHIPPED"; ci=7;  type="Earrings";metal="18K"; color="WG-White"; shape="Cushion"; carat="1.20"; quality="VVS1-E"; cost=3600; sku="CJ01028-18W"; tracking="9261290100830090", shipMethod="FedEx"; notes="High-value shipment. Signature required on delivery." },

  # DELIVERED (2)
  @{ po="KJ-TEST-029"; status="DELIVERED"; ci=8;  type="Ring";    metal="18K"; color="WG-White"; shape="Round";   carat="2.00"; quality="VVS2-D"; cost=6200; sku="CJ01029-18W"; tracking="77312940298499"; shipMethod="FedEx"; notes="Delivered and confirmed. Customer extremely happy with the piece." },
  @{ po="KJ-TEST-030"; status="DELIVERED"; ci=9;  type="Pendant"; metal="14K"; color="WG-White"; shape="Emerald"; carat="1.00"; quality="VS1-G"; cost=1800; sku="CJ01030-14W"; tracking="1Z9V39W40394830500"; shipMethod="UPS"; notes="Delivered. Customer sent thank-you note — requesting repeat order." }
)

$orderIds = @{}
foreach ($o in $orders) {
  $custIdx = $o.ci
  $body = @{
    poNumber=$o.po; status=$o.status; orderType=$o.type; metalType=$o.metal; metalColor=$o.color
    centerStoneShape=$o.shape; approximateCaratWeight=$o.carat; diamondQuality=$o.quality
    quotedCost=$o.cost; customerNotes=$o.notes; manufacturingPath="STANDARD"
    customerId=(cid $custIdx); customerEmail=(cemail $custIdx); customerFullName=(cname $custIdx)
    storeName=(cstore $custIdx); salesRepEmail="sales@kirajewels.one"
    kiraSkuNumber=($o.sku ?? $null); vendorName=($o.vendor ?? $null)
    rcVpoNumber=($o.vpo ?? $null); rcJobBagNumber=($o.jb ?? $null)
    trackingNumber=($o.tracking ?? $null); shipMethod=($o.shipMethod ?? $null)
    diamondType="Lab"
  } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$API/orders" -Method POST -Headers $h -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue
  if ($res.id) {
    $orderIds[$o.po] = $res.id
    Write-Host "  + $($o.po) [$($o.status)]"
  } else {
    Write-Host "  ! Skipped $($o.po)"
  }
}

# Update status directly in DB for orders that need specific status (API create always starts at WAITING_CONFIRMATION for some statuses)
Write-Host "`nUpdating order statuses in DB..."
foreach ($o in $orders) {
  $id = $orderIds[$o.po]
  if ($id) {
    psql "UPDATE orders SET status='$($o.status)' WHERE id='$id';"
  }
}

# ─── CAD FILES ───────────────────────────────────────────────────────────────
Write-Host "`nCreating CAD files..."
$cadData = @(
  # PENDING_CAD orders — 1 uploaded CAD each
  @{ po="KJ-TEST-004"; file="oval_solitaire_v1.stl";     status="UPLOADED";          rev=1; notes="Initial CAD uploaded. East-west orientation as requested. Please review proportions." },
  @{ po="KJ-TEST-005"; file="pear_pendant_halo_v1.3dm";  status="UPLOADED";          rev=1; notes="First draft — pear pendant with hidden halo. Chain loop slightly larger for flexibility." },
  @{ po="KJ-TEST-006"; file="3stone_cathedral_v1.stl";   status="UPLOADED";          rev=1; notes="Three-stone CAD ready for review. Side stone ratio set to 30% of center." },

  # CAD_IN_PROGRESS — sent for approval
  @{ po="KJ-TEST-007"; file="radiant_halo_v1.3dm";       status="SENT_FOR_APPROVAL"; rev=1; notes="Radiant halo with micropave shank. Please review the halo spacing and band width. Waiting for customer feedback." },
  @{ po="KJ-TEST-007"; file="radiant_halo_v2.stl";       status="SENT_FOR_APPROVAL"; rev=2; notes="Revised: tightened halo, thinned band to 1.8mm as requested. Ready for final approval." },
  @{ po="KJ-TEST-008"; file="tennis_bracelet_v1.obj";    status="SENT_FOR_APPROVAL"; rev=1; notes="Tennis bracelet CAD — 25 stones, 4-prong each. Classic spacing. Sent to customer for approval." },
  @{ po="KJ-TEST-009"; file="princess_solitaire_v1.stl"; status="SENT_FOR_APPROVAL"; rev=1; notes="High cathedral princess solitaire. Clean profile, 2mm band. Ready for customer review." },

  # CUSTOMER_APPROVED — approved CADs
  @{ po="KJ-TEST-010"; file="oval_hidden_halo_v1.3dm";   status="APPROVED";          rev=1; notes="First CAD submitted." },
  @{ po="KJ-TEST-010"; file="oval_hidden_halo_v2.3dm";   status="APPROVED";          rev=2; notes="Split shank adjusted as per customer request. Approved by customer." },
  @{ po="KJ-TEST-011"; file="bezel_pave_pendant_v1.stl"; status="APPROVED";          rev=1; notes="Bezel with pave border. Customer approved on first submission." },
  @{ po="KJ-TEST-012"; file="cushion_halo_2tone_v1.3dm"; status="APPROVED";          rev=1; notes="Initial design." },
  @{ po="KJ-TEST-012"; file="cushion_halo_2tone_v2.3dm"; status="APPROVED";          rev=2; notes="Minor halo gap adjustment. Customer approved final version." },

  # CUSTOMER_REJECTED — rejected CADs
  @{ po="KJ-TEST-013"; file="halo_ring_v1.stl";          status="REJECTED";          rev=1; notes="Customer requested change from halo to solitaire design entirely." },
  @{ po="KJ-TEST-014"; file="pear_earrings_v1.3dm";      status="REVISION_REQUESTED";rev=1; notes="Customer noted prong orientation looks awkward. Requesting side-view adjustment." },

  # Later stage orders — approved CADs
  @{ po="KJ-TEST-015"; file="oval_micropave_final.stl";  status="APPROVED"; rev=1; notes="Final approved CAD for production." },
  @{ po="KJ-TEST-016"; file="heart_pendant_final.3dm";   status="APPROVED"; rev=1; notes="Heart pendant approved. Engraving spec noted." },
  @{ po="KJ-TEST-017"; file="round_solitaire_final.stl"; status="APPROVED"; rev=1; notes="Production-ready file." },
  @{ po="KJ-TEST-018"; file="oval_bezel_final.3dm";      status="APPROVED"; rev=1; notes="Production-ready file." },
  @{ po="KJ-TEST-019"; file="cushion_halo_final.stl";    status="APPROVED"; rev=2; notes="Final production CAD for cushion halo." },
  @{ po="KJ-TEST-020"; file="tennis_bracelet_final.obj"; status="APPROVED"; rev=1; notes="Tennis bracelet production file." }
)

foreach ($cad in $cadData) {
  $oid = $orderIds[$cad.po]
  if (-not $oid) { continue }
  $uid = [guid]::NewGuid().ToString()
  $fn  = $cad.file
  $fp  = "uploads/cad/$($cad.po)/$fn"
  $st  = $cad.status
  $rev = $cad.rev
  $notes = $cad.notes -replace "'","''"
  $ts  = (Get-Date).AddDays(-[math]::Round((Get-Random -Min 1 -Max 20))).ToString("yyyy-MM-dd HH:mm:ss")
  psql "INSERT INTO cad_files (id,`"orderId`",`"originalName`",`"fileName`",`"filePath`",status,`"uploadedBy`",`"revisionNumber`",`"designerNotes`",`"createdAt`",`"updatedAt`") VALUES ('$uid','$oid','$fn','$fn','$fp','$st','$CAD_ID',$rev,'$notes','$ts','$ts');"
  Write-Host "  + CAD: $($cad.po) rev$rev [$st]"
}

# ─── CONVERSATIONS ───────────────────────────────────────────────────────────
Write-Host "`nCreating conversations..."

function msg($oid, $authorId, $authorName, $authorRole, $content, $internal, $mentions="") {
  if (-not $oid) { return }
  $uid = [guid]::NewGuid().ToString()
  $c   = $content -replace "'","''"
  $m   = $mentions -replace "'","''"
  $int = if ($internal) { "true" } else { "false" }
  $ts  = (Get-Date).AddHours(-[math]::Round((Get-Random -Min 1 -Max 200))).ToString("yyyy-MM-dd HH:mm:ss")
  psql "INSERT INTO order_messages (id,`"orderId`",`"authorId`",`"authorName`",`"authorRole`",content,`"isInternal`",mentions,`"createdAt`") VALUES ('$uid','$oid','$authorId','$authorName','$authorRole','$c',$int,'$m','$ts');"
}

# KJ-TEST-001 — Customer just placed, waiting confirmation
$oid = $orderIds["KJ-TEST-001"]
$cid_email = cemail 0; $custId = $custIds[$cid_email]; $custName = cname 0
msg $oid $custId $custName "CUSTOMER" "Hi! Just placed this order. Can you also show me a rose gold option in the CAD for comparison? My client might want that instead." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Hi James! Absolutely — we'll ask the CAD team to render both WG and RG options side by side. Should have the authorizer review this shortly." $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Checked specs — all looks good. Rose gold variation noted for CAD team. Authorizing now." $true "@CAD_DESIGNER"

# KJ-TEST-002 — Waiting confirmation
$oid = $orderIds["KJ-TEST-002"]
$custId = $custIds[(cemail 1)]; $custName = cname 1
msg $oid $custId $custName "CUSTOMER" "Quick question — does the bezel setting add much to the overall height of the pendant? Want to make sure it sits flat against the neckline." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Great question Priya — standard bezel adds about 1.5–2mm to the profile. We can specify a low-profile bezel in the CAD to keep it flatter." $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "New order — simple pendant, low risk. Approved for CAD. @CAD_DESIGNER note: customer wants low-profile bezel." $true "@CAD_DESIGNER"

# KJ-TEST-004 — Pending CAD
$oid = $orderIds["KJ-TEST-004"]
$custId = $custIds[(cemail 3)]; $custName = cname 3
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Authorized. @CAD_DESIGNER — east-west orientation, knife-edge shank. No side stones, keep it clean. Reference: see customer's Instagram DM saved in Smartsheet." $true "@CAD_DESIGNER"
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Got it. Starting on the east-west emerald today. Knife-edge shank and 4-prong low head. Will have v1 up by tomorrow." $true
msg $oid $custId $custName "CUSTOMER" "Hi! Any update on when I'll see the first CAD? My client is very eager to see the design." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Hi Sofia! Our CAD designer has it on today's queue — you should see the first render within 24 hours." $false

# KJ-TEST-005 — Pending CAD
$oid = $orderIds["KJ-TEST-005"]
$custId = $custIds[(cemail 4)]; $custName = cname 4
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Approved. @CAD_DESIGNER — pear pendant, hidden halo. Yellow gold basket, white gold prongs. Fine chain loop at top, not bulky." $true "@CAD_DESIGNER"
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Understood. Any preference on chain loop diameter? Standard is 4mm inner diameter." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Let's go with 5mm to fit thicker chains. Customer might use a thicker box chain." $true

# KJ-TEST-007 — CAD in progress
$oid = $orderIds["KJ-TEST-007"]
$custId = $custIds[(cemail 6)]; $custName = cname 6
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Radiant halo v1 uploaded. Halo has 36 round pave stones, band is pavé both sides for 2/3 of the shank. Let me know if the halo gap needs adjustment." $true
msg $oid $custId $custName "CUSTOMER" "Received the CAD — it looks stunning! One thing: can the band be slightly thinner? And is the halo gap uniform all around?" $false
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Working on v2 now — thinning band to 1.8mm and tightening the halo gap for uniformity. Should be ready by end of day." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Good progress. @CAD_DESIGNER once v2 is approved let's fast-track to SKU since this customer has a deadline." $true "@CAD_DESIGNER"
msg $oid $custId $custName "CUSTOMER" "Thank you for the quick turnaround! My client is excited. We'll review v2 as soon as it's ready." $false

# KJ-TEST-008 — CAD in progress
$oid = $orderIds["KJ-TEST-008"]
$custId = $custIds[(cemail 7)]; $custName = cname 7
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Tennis bracelet CAD sent for approval. 25 stones, 4-prong each, 7-inch length. Classic spacing matches the Tiffany reference." $true
msg $oid $custId $custName "CUSTOMER" "Just reviewed — the spacing looks perfect! One small thing: can the clasp be a box clasp instead of a lobster clasp? More secure for a bracelet this valuable." $false
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Absolutely — box clasp is more appropriate for a tennis bracelet anyway. I'll update the CAD. Won't take long." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Good catch by the customer. Box clasp is standard for high-value tennis bracelets. @CAD_DESIGNER please note the clasp spec in the production notes too." $true "@CAD_DESIGNER"

# KJ-TEST-010 — Customer approved
$oid = $orderIds["KJ-TEST-010"]
$custId = $custIds[(cemail 9)]; $custName = cname 9
msg $oid $custId $custName "CUSTOMER" "Reviewed both versions of the CAD — v2 is perfect! The split shank looks elegant. Approving this one. Please proceed to production." $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Customer approved v2. @SKU_MANAGER — please assign SKU and move to production queue." $true "@SKU_MANAGER"
msg $oid $SKU_ID "Jake Morris" "SKU_MANAGER" "SKU assigned: CJ01010-14W. Moving to factory queue." $true
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Great news Laura! Your order is approved and heading to our production team. Estimated completion is 3–4 weeks." $false

# KJ-TEST-011 — Customer approved first try
$oid = $orderIds["KJ-TEST-011"]
$custId = $custIds[(cemail 10)]; $custName = cname 10
msg $oid $custId $custName "CUSTOMER" "The CAD looks exactly like what I envisioned! Approving immediately. Please move forward." $false
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "First-time approval — always a pleasure! @SKU_MANAGER ready for you." $true "@SKU_MANAGER"
msg $oid $SKU_ID "Jake Morris" "SKU_MANAGER" "SKU assigned and in production queue." $true

# KJ-TEST-013 — Rejected, needs redesign
$oid = $orderIds["KJ-TEST-013"]
$custId = $custIds[(cemail 12)]; $custName = cname 12
msg $oid $custId $custName "CUSTOMER" "After showing my customer the halo design, they've changed their mind completely. They want a clean solitaire — no halo at all. I'm sorry for the back and forth." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "No problem at all Brianna! Design changes happen. We'll have the CAD team start a new solitaire version for you." $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "@CAD_DESIGNER — KJ-TEST-013 customer changed to solitaire. Please redo the CAD from scratch, no halo. Keep the same metal and stone." $true "@CAD_DESIGNER"
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Understood. Will create a fresh solitaire design. Should be faster this time — simple 4-prong head on a tapered shank." $true

# KJ-TEST-014 — Revision requested
$oid = $orderIds["KJ-TEST-014"]
$custId = $custIds[(cemail 13)]; $custName = cname 13
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "Pear drop earrings uploaded. Prongs are positioned for maximum visibility and security." $true
msg $oid $custId $custName "CUSTOMER" "I showed the CAD to my client and she noticed the prongs look a bit asymmetrical in the side view. Could you check if they're balanced?" $false
msg $oid $CAD_ID "Maya Patel" "CAD_DESIGNER" "I see it — the rendering angle made one prong look off but it's actually a 3D perspective issue. Let me re-render from multiple angles to confirm and adjust if needed." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Please fix the rendering AND confirm physical prong symmetry in the file. Customer perception matters even if it's just visual." $true

# KJ-TEST-017 — VPO Issued
$oid = $orderIds["KJ-TEST-017"]
$custId = $custIds[(cemail 16)]; $custName = cname 16
msg $oid $FACTORY_ID "Arjun Singh" "FACTORY_MANAGER" "VPO-40291 issued to Creations. Confirmed receipt from factory. Expected completion: 18 business days." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Thanks Arjun. @FACTORY_MANAGER please flag immediately if there are any casting issues with the gold purity." $true "@FACTORY_MANAGER"
msg $oid $custId $custName "CUSTOMER" "Hi! Just checking in — when do you expect the ring to be ready?" $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Hi Diane! Your order is currently in production at our factory. Expected completion is approximately 3.5 weeks from today." $false

# KJ-TEST-019 — Job bag created, in production
$oid = $orderIds["KJ-TEST-019"]
$custId = $custIds[(cemail 18)]; $custName = cname 18
msg $oid $FACTORY_ID "Arjun Singh" "FACTORY_MANAGER" "Job bag JB-40280 created. Metal has been cast — 18K white gold came out clean. Stone setting begins next week." $true
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Excellent. This is a high-value piece — please double-check the cushion halo stone alignment before closing the job bag." $true
msg $oid $FACTORY_ID "Arjun Singh" "FACTORY_MANAGER" "Noted. Will do a full photo QC before sign-off. @SHIPPING_MANAGER heads up — this one will need extra packaging care, 5.2ct cushion halo." $true "@SHIPPING_MANAGER"
msg $oid $SHIP_ID "Lisa Nguyen" "SHIPPING_MANAGER" "Thanks for the heads up Arjun. Will prep double-box FedEx with signature required." $true

# KJ-TEST-023 — Ready to ship
$oid = $orderIds["KJ-TEST-023"]
$custId = $custIds[(cemail 2)]; $custName = cname 2
msg $oid $SHIP_ID "Lisa Nguyen" "SHIPPING_MANAGER" "Order packaged and ready for dispatch. Ring box + appraisal certificate + polishing cloth included. @AUTHORIZER please confirm dispatch authorization." $true "@AUTHORIZER"
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Authorized for shipping. FedEx overnight as agreed." $true
msg $oid $custId $custName "CUSTOMER" "Just wanted to say my client is so excited to receive this! She's been counting down the days." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "That's wonderful Carlos! Your order ships today — you'll receive a tracking number by email shortly." $false

# KJ-TEST-026 — Shipped
$oid = $orderIds["KJ-TEST-026"]
$custId = $custIds[(cemail 5)]; $custName = cname 5
msg $oid $SHIP_ID "Lisa Nguyen" "SHIPPING_MANAGER" "Dispatched via FedEx overnight. Tracking: 77312940298410. ETA: tomorrow by 10:30am." $true
msg $oid $custId $custName "CUSTOMER" "Received the FedEx tracking — thank you! I can see it's out for delivery tomorrow morning." $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Perfect! Please let us know once it arrives. We'd love to see a photo of the finished piece." $false

# KJ-TEST-029 — Delivered
$oid = $orderIds["KJ-TEST-029"]
$custId = $custIds[(cemail 8)]; $custName = cname 8
msg $oid $custId $custName "CUSTOMER" "Just received the ring — it is absolutely breathtaking. My client cried when she saw it. The craftsmanship is flawless. Thank you so much!" $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Ahmed, this message made our whole team's day! We'd love to feature it on our Instagram if your client is open to it." $false
msg $oid $custId $custName "CUSTOMER" "She said yes! I'll send photos later this week. Also, she's already asking about a matching pendant — can we start a new order?" $false
msg $oid $SALES_ID "Sarah Chen" "SALES_REP" "Absolutely! I'll have our design team reach out to discuss the matching pendant." $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Great customer, always smooth to work with. @SALES_REP — flag this account for VIP treatment on next order." $true "@SALES_REP"

# KJ-TEST-030 — Delivered, repeat order coming
$oid = $orderIds["KJ-TEST-030"]
$custId = $custIds[(cemail 9)]; $custName = cname 9
msg $oid $SHIP_ID "Lisa Nguyen" "SHIPPING_MANAGER" "Confirmed delivered via UPS. Signature obtained 10:14am." $true
msg $oid $custId $custName "CUSTOMER" "Perfect delivery, exactly as expected. The emerald pendant is stunning. Our customer is asking about a matching ring already!" $false
msg $oid $AUTH_ID "Raj Sharma" "AUTHORIZER" "Excellent outcome. This customer consistently places repeat orders. Mark as priority for next engagement." $true

Write-Host "`n✅ Seed complete!"
Write-Host "   Customers created: $($custIds.Count)"
Write-Host "   Orders created:    $($orderIds.Count)"
Write-Host "   CAD files:         $($cadData.Count)"
Write-Host "   Conversations:     check DB for order_messages count"
