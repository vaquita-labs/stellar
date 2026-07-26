INSERT INTO "public"."achievements" ("key", "name", "description", "tier", "code", "coin_reward", "hidden", "refresh_policy", "cycle_scoped", "deleted_at", "unlock_type", "rule", "icon", "accent", "display_order", "enabled", "updated_at") VALUES
-- Progresión: primeros pasos (Bronze)
('first_deposit', 'First Deposit', 'Made your very first deposit in Vaquita.', 'Bronze', null, '25', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 1, "signal": "activeDeposits"}]}', '/icons/achievements/first-deposit.png', 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', '1', 'true', now()),
('second_deposit', 'Second deposit', 'Second deposit', 'Bronze', null, '25', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 2, "signal": "activeDeposits"}]}', null, null, '2', 'true', now()),
('first_friend', 'Crew Mate', 'Follow your first fellow vaquero.', 'Bronze', null, '25', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 1, "signal": "friendsCount"}]}', '/icons/achievements/first-friend.png', 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', '3', 'true', now()),
('rookie', 'Rookie', 'Earn your first 50 XP. Welcome to the herd.', 'Bronze', null, '25', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 50, "signal": "experience"}]}', '/icons/achievements/rookie.png', 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', '4', 'true', now()),
('week_warrior', 'Week Warrior', 'Reach a 7-day savings streak.', 'Bronze', null, '25', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 7, "signal": "streakCount"}]}', '/icons/achievements/week-warrior.png', 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', '5', 'true', now()),
-- Progresión: nivel medio (Silver)
('savings_starter', 'Savings Starter', 'Reach $100 USDC in cumulative deposits.', 'Silver', null, '50', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 100, "signal": "activeAmount"}]}', '/icons/achievements/savings-starter.png', 'linear-gradient(180deg, #C6F1A8 0%, #58CC02 100%)', '6', 'true', now()),
('trio_saver', 'Triple Threat', 'Keep 3 active deposits running at the same time.', 'Silver', null, '50', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 3, "signal": "activeDeposits"}]}', '/icons/achievements/trio-saver.png', 'linear-gradient(180deg, #B89AFF 0%, #7C4DFF 100%)', '7', 'true', now()),
('explorer', 'Explorer', 'Earn 300 XP across all challenges.', 'Silver', null, '50', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 300, "signal": "experience"}]}', '/icons/achievements/explorer.png', 'linear-gradient(180deg, #FFE082 0%, #F5A161 100%)', '8', 'true', now()),
('month_master', 'Month Master', 'Reach a 30-day savings streak.', 'Silver', null, '50', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 30, "signal": "streakCount"}]}', '/icons/achievements/month-master.png', 'linear-gradient(180deg, #FF8A65 0%, #E64A19 100%)', '9', 'true', now()),
-- Progresión: nivel alto (Gold / Diamond)
('streak_master', 'Streak Master', 'Reach a 50-day savings streak.', 'Gold', null, '100', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 50, "signal": "streakCount"}]}', '/icons/achievements/streak-master.png', 'linear-gradient(180deg, #FFB347 0%, #FF7A00 100%)', '10', 'true', now()),
('savings_baron', 'Savings Baron', 'Reach $10,000 USDC in cumulative deposits.', 'Gold', null, '100', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 10000, "signal": "activeAmount"}]}', '/icons/achievements/savings-baron.png', 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', '11', 'true', now()),
('whale', 'Vaquita Whale', 'Reach 30,000 XP. Now THAT is dedication.', 'Gold', null, '100', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 30000, "signal": "experience"}]}', '/icons/achievements/whale.png', 'linear-gradient(180deg, #BBDEFB 0%, #1E88E5 100%)', '12', 'true', now()),
('century_saver', 'Century Saver', 'Reach a 100-day savings streak. Legendary.', 'Diamond', null, '250', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": ">=", "value": 100, "signal": "streakCount"}]}', '/icons/achievements/century-saver.png', 'linear-gradient(180deg, #FFD180 0%, #FF6F00 100%)', '13', 'true', now()),
-- Leaderboard mensual (cycle_rank)
('third_place', 'Bronze Medalist', 'Finish #3 on the monthly leaderboard.', 'Bronze', null, '50', 'false', 'auto', 'true', null, 'cycle_rank', null, '/icons/achievements/third-place.png', 'linear-gradient(180deg, #FFCC80 0%, #A05A2C 100%)', '14', 'true', now()),
('second_place', 'Silver Medalist', 'Finish #2 on the monthly leaderboard.', 'Silver', null, '100', 'false', 'auto', 'true', null, 'cycle_rank', null, '/icons/achievements/second-place.png', 'linear-gradient(180deg, #E0E0E0 0%, #9E9E9E 100%)', '15', 'true', now()),
('first_place', 'Gold Medalist', 'Finish #1 on the monthly leaderboard.', 'Gold', null, '150', 'false', 'auto', 'true', null, 'cycle_rank', null, '/icons/achievements/first-place.png', 'linear-gradient(180deg, #FFE082 0%, #FFA000 100%)', '16', 'true', now()),
-- Especiales / Founder
('beta_tester', 'Beta Tester', 'You joined Vaquita during the beta. Thanks for helping us shape it.', 'Founder', null, '150', 'false', 'auto', 'false', null, 'rule', '{"all": [{"op": "before", "value": "2026-06-20T23:59:59Z", "signal": "createdAt"}]}', '/icons/achievements/beta-tester2.png', 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)', '17', 'true', now()),
('starmaker_latam', 'StarMaker LATAM', 'Estuviste en StarMaker LATAM. Un badge que no aparece en la lista hasta que alguien te pasa el código.', 'Founder', 'starmaker', '100', 'true', 'auto', 'false', null, 'redeem_code', null, '/icons/achievements/starmaker_latam.png', 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)', '18', 'true', now()),
-- Deshabilitados
('triple_saver', 'Objetivo 7 Días', 'Completaste tu objetivo de 7 días de ahorro!', 'Silver', '7days', '25', 'false', 'auto', 'false', null, 'redeem_code', null, '/icons/achievements/7-days.png', null, '19', 'false', now()),
('feedbacks', 'si, ya vimos este bug...', 'ah estas chismoso', 'Bronze', 'feedback', '1', 'false', 'auto', 'false', null, 'redeem_code', null, null, null, '20', 'false', now())
    ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
                               "description" = EXCLUDED."description",
                               "tier" = EXCLUDED."tier",
                               "code" = EXCLUDED."code",
                               "coin_reward" = EXCLUDED."coin_reward",
                               "hidden" = EXCLUDED."hidden",
                               "refresh_policy" = EXCLUDED."refresh_policy",
                               "cycle_scoped" = EXCLUDED."cycle_scoped",
                               "deleted_at" = EXCLUDED."deleted_at",
                               "unlock_type" = EXCLUDED."unlock_type",
                               "rule" = EXCLUDED."rule",
                               "icon" = EXCLUDED."icon",
                               "accent" = EXCLUDED."accent",
                               "display_order" = EXCLUDED."display_order",
                               "enabled" = EXCLUDED."enabled",
                               "updated_at" = now();
