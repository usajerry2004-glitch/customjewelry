UPDATE orders o
SET "cadSubStatus" = 'UPLOADED'
WHERE o.status = 'CAD_IN_PROGRESS'
  AND o."cadSubStatus" IS NULL
  AND EXISTS (
    SELECT 1 FROM cad_files c WHERE c."orderId" = o.id::text
  );

SELECT COUNT(*) AS now_uploaded
FROM orders
WHERE status = 'CAD_IN_PROGRESS'
  AND "cadSubStatus" = 'UPLOADED';
