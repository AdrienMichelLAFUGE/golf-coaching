UPDATE organizations
SET plan_tier = 'free'
WHERE (stripe_subscription_id IS NULL OR stripe_status IS NULL);
