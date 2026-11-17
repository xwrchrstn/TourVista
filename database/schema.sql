-- Generated from server/storage.js; existing installations migrate at API startup.
CREATE TABLE IF NOT EXISTS app_lock (id INT PRIMARY KEY) ENGINE=InnoDB;

INSERT IGNORE INTO app_lock (id) VALUES (1);

CREATE TABLE IF NOT EXISTS settings (id INT PRIMARY KEY, config JSON NOT NULL) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `users` (`id` INT PRIMARY KEY, `name` VARCHAR(100), `email` VARCHAR(160) UNIQUE, `passwordHash` VARCHAR(200), `role` VARCHAR(20), `active` BOOLEAN, `verified` BOOLEAN, `emailVerified` BOOLEAN, `emailVerificationRequired` BOOLEAN) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `campsites` (`id` INT PRIMARY KEY, `ownerId` INT, `name` VARCHAR(120), `description` TEXT, `price` DOUBLE, `latitude` DOUBLE, `longitude` DOUBLE, `amenities` JSON, `polygon` JSON, `rules` TEXT, `imageUrl` VARCHAR(1000), `active` BOOLEAN, `approvalStatus` VARCHAR(20), `revision` INT, `reviewId` INT, `demoListing` BOOLEAN, `moderationNote` TEXT, `profile` JSON, FOREIGN KEY (`ownerId`) REFERENCES `users`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `units` (`id` INT PRIMARY KEY, `campId` INT, `name` VARCHAR(100), `capacity` INT, `active` BOOLEAN, FOREIGN KEY (`campId`) REFERENCES `campsites`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `reservations` (`id` INT PRIMARY KEY, `unitId` INT, `userId` INT, `start` VARCHAR(10), `end` VARCHAR(10), `partySize` INT, `status` VARCHAR(20), `createdAt` VARCHAR(40), `requestKey` VARCHAR(100), `contactName` VARCHAR(100), `contactEmail` VARCHAR(160), `contactPhone` VARCHAR(30), `unitPrice` DOUBLE, `updatedAt` VARCHAR(40), `campSnapshot` JSON, FOREIGN KEY (`unitId`) REFERENCES `units`(id), UNIQUE KEY request_identity (userId, requestKey), INDEX unit_dates (unitId, start, end)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `closures` (`id` INT PRIMARY KEY, `unitId` INT, `start` VARCHAR(10), `end` VARCHAR(10), `reason` VARCHAR(300), `active` BOOLEAN, FOREIGN KEY (`unitId`) REFERENCES `units`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `reviews` (`id` INT PRIMARY KEY, `reservationId` INT UNIQUE, `userId` INT, `rating` INT, `text` TEXT, `visible` BOOLEAN, `createdAt` VARCHAR(40), FOREIGN KEY (`reservationId`) REFERENCES `reservations`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `itineraries` (`id` INT PRIMARY KEY, `userId` INT UNIQUE, `stops` JSON, FOREIGN KEY (`userId`) REFERENCES `users`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `checkins` (`id` INT PRIMARY KEY, `reservationId` INT UNIQUE, `actorId` INT, `method` VARCHAR(30), `accuracy` DOUBLE, `reason` VARCHAR(300), `createdAt` VARCHAR(40), FOREIGN KEY (`reservationId`) REFERENCES `reservations`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `audit` (`id` INT PRIMARY KEY, `actorId` INT, `action` VARCHAR(80), `recordId` INT, `createdAt` VARCHAR(40)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `resetRequests` (`id` INT PRIMARY KEY, `userId` INT, `tokenHash` VARCHAR(100), `expires` DOUBLE, `resolved` BOOLEAN, `createdAt` VARCHAR(40)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `forecasts` (`id` INT PRIMARY KEY, `campId` INT, `start` VARCHAR(10), `end` VARCHAR(10), `fetchedAt` VARCHAR(40), `version` VARCHAR(100), `snapshot` JSON, FOREIGN KEY (`campId`) REFERENCES `campsites`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `ownershipSubmissions` (`id` INT PRIMARY KEY, `campId` INT, `ownerId` INT, `revision` INT, `status` VARCHAR(20), `legalName` VARCHAR(160), `documentType` VARCHAR(100), `statement` TEXT, `documents` JSON, `listingSnapshot` JSON, `submittedAt` VARCHAR(40), `reviewedAt` VARCHAR(40), `reviewedBy` INT, `reason` TEXT, FOREIGN KEY (`campId`) REFERENCES `campsites`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `campsitePhotos` (`id` INT PRIMARY KEY, `campId` INT, `ownerId` INT, `file` JSON, `createdAt` VARCHAR(40), FOREIGN KEY (`campId`) REFERENCES `campsites`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `emailVerifications` (`id` INT PRIMARY KEY, `userId` INT, `email` VARCHAR(160), `tokenHash` VARCHAR(64), `expires` DOUBLE, `resolved` BOOLEAN, `createdAt` VARCHAR(40), FOREIGN KEY (`userId`) REFERENCES `users`(id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `rankings` (`id` INT PRIMARY KEY, `userId` INT, `createdAt` VARCHAR(40), `details` JSON) ENGINE=InnoDB;
