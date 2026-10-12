CREATE TABLE `verified_listening01_attempts` (
	`learner_id` text NOT NULL,
	`record_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`selected_answer` text NOT NULL,
	`score` real NOT NULL,
	`completed` integer NOT NULL,
	`verified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (`learner_id`, `record_id`)
);
