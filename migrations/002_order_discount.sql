-- amountPaid появился во внешнем API 15.03.2026: у более ранних заказов его нет,
-- поэтому колонка nullable и не бэкфиллится — «нет данных о фактической оплате».
ALTER TABLE orders ADD COLUMN amount_paid_kop BIGINT;
