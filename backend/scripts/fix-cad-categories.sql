UPDATE cad_files SET "designerNotes" = 'Reference image' WHERE "designerNotes" = 'Smartsheet import' AND LOWER("originalName") NOT LIKE 'cj%';
UPDATE cad_files SET "designerNotes" = 'Smartsheet import' WHERE "designerNotes" = 'Reference image' AND LOWER("originalName") LIKE 'cj%';
SELECT "designerNotes", COUNT(*) FROM cad_files GROUP BY "designerNotes";
