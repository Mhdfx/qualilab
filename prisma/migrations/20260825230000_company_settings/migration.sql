-- CreateTable
CREATE TABLE `CompanySettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'company',
    `name` VARCHAR(191) NOT NULL,
    `tagline` TEXT NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `website` VARCHAR(191) NOT NULL,
    `ice` VARCHAR(191) NOT NULL,
    `rc` VARCHAR(191) NOT NULL,
    `bank` VARCHAR(191) NOT NULL,
    `rib` VARCHAR(191) NOT NULL,
    `iban` VARCHAR(191) NOT NULL,
    `swift` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

