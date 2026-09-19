CREATE TABLE `learner_progress` (
	`learner_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
