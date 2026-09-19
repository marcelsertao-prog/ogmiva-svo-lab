CREATE TABLE `learner_accounts` (
	`login_id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`credential_hash` text NOT NULL
);
