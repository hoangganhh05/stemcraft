-- CreateTable
CREATE TABLE `audio_jobs` (
    `id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `model_id` VARCHAR(80) NOT NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'QUEUED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `duration_seconds` DOUBLE NOT NULL,
    `completed_chunks` INTEGER NOT NULL DEFAULT 0,
    `total_chunks` INTEGER NOT NULL DEFAULT 0,
    `error_code` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,

    INDEX `audio_jobs_status_created_at_idx`(`status`, `created_at`),
    INDEX `audio_jobs_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
