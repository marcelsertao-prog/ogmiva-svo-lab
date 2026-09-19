CREATE TABLE `learner_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`expires_at` text NOT NULL
);
