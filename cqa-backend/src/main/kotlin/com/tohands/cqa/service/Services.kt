package com.tohands.cqa.service

import com.tohands.cqa.config.JwtProvider
import com.tohands.cqa.model.*
import com.tohands.cqa.repository.*
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Service
class NotificationService(
    private val messagingTemplate: SimpMessagingTemplate
) {
    fun broadcastDeviceUpdate(device: Device) {
        try {
            messagingTemplate.convertAndSend("/topic/devices", device)
        } catch (e: Exception) {
            // Non-blocking logging
        }
    }

    fun broadcastInventoryUpdate(partNumber: String) {
        try {
            messagingTemplate.convertAndSend("/topic/inventory", mapOf("partNumber" to partNumber, "timestamp" to Instant.now().toString()))
        } catch (e: Exception) {
            // Non-blocking
        }
    }
}

data class LoginRequest(val username: String, val password: String)
data class LoginResponse(val token: String, val user: User)

@Service
class AuthService(
    private val userRepository: UserRepository,
    private val jwtProvider: JwtProvider,
    private val passwordEncoder: PasswordEncoder
) {
    fun login(request: LoginRequest): LoginResponse {
        val user = userRepository.findById(request.username).orElse(null)
            ?: userRepository.findByEmail(request.username)
            ?: throw IllegalArgumentException("Invalid username or password")

        val matches = if (user.passwordHash.startsWith("$2a$") || user.passwordHash.startsWith("$2b$")) {
            passwordEncoder.matches(request.password, user.passwordHash)
        } else {
            // Safe fallback for seeded dev accounts
            request.password == user.passwordHash
        }

        if (!matches) {
            throw IllegalArgumentException("Invalid username or password")
        }

        val token = jwtProvider.generateToken(user.id, user.role, user.name)
        return LoginResponse(token, user)
    }

    fun getUser(userId: String): User {
        return userRepository.findById(userId).orElseThrow { IllegalArgumentException("User not found") }
    }
}

data class StationProcessRequest(
    val serialNumber: String,
    val stationId: Int,
    val stationName: String,
    val status: String, // PASS, FAIL, Completed, Scrap
    val remarks: String? = null,
    val testData: String? = null,
    val operatorId: String,
    val operatorName: String?
)

@Service
class StationService(
    private val deviceRepository: DeviceRepository,
    private val historyRepository: DeviceStationHistoryRepository,
    private val notificationService: NotificationService
) {
    @Transactional
    fun processStation(req: StationProcessRequest): Device {
        val normalizedSerial = req.serialNumber.trim().uppercase()
        val device = deviceRepository.findById(normalizedSerial).orElseGet {
            Device(
                serialNumber = normalizedSerial,
                projectId = "CALCULATOR",
                currentStationId = req.stationId,
                stationName = req.stationName,
                status = "In Progress",
                stage = req.stationName
            )
        }

        device.currentStationId = if (req.status == "PASS") req.stationId + 1 else req.stationId
        device.stationName = req.stationName
        device.stage = req.stationName
        device.lastOperatorId = req.operatorId
        device.updatedAt = Instant.now()

        if (req.status == "FAIL") {
            device.failCount += 1
            device.status = if (device.failCount >= 3) "Scrap" else "Hold"
            if (device.failCount >= 3) {
                device.isHeld = true
                device.holdReason = "Auto-scrapped after 3 failure attempts at ${req.stationName}"
            }
        } else if (req.stationId >= 9 && req.status == "PASS") {
            device.status = "Completed"
        } else {
            device.status = "In Progress"
        }

        val savedDevice = deviceRepository.save(device)

        historyRepository.save(
            DeviceStationHistory(
                serialNumber = normalizedSerial,
                stationId = req.stationId,
                stationName = req.stationName,
                operatorId = req.operatorId,
                operatorName = req.operatorName,
                status = req.status,
                remarks = req.remarks,
                testData = req.testData
            )
        )

        notificationService.broadcastDeviceUpdate(savedDevice)
        return savedDevice
    }

    @Transactional
    fun unholdSerial(serialNumber: String, reason: String, operatorId: String): Device {
        val device = deviceRepository.findById(serialNumber.trim().uppercase())
            .orElseThrow { IllegalArgumentException("Device not found") }
        device.isHeld = false
        device.holdReason = null
        device.status = "In Progress"
        device.updatedAt = Instant.now()

        val saved = deviceRepository.save(device)
        notificationService.broadcastDeviceUpdate(saved)
        return saved
    }
}

data class OpeningStockChunkItem(
    val partNumber: String,
    val partName: String?,
    val physicalCount: BigDecimal,
    val cost: BigDecimal?,
    val location: String?,
    val uom: String?
)

@Service
class BaanInventoryService(
    private val batchRepository: BaanBatchRepository,
    private val movementRepository: BaanMovementRepository,
    private val lockRepository: InventoryLockRepository,
    private val discrepancyRepository: InventoryDiscrepancyRepository,
    private val partRepository: BaanPartRepository,
    private val notificationService: NotificationService
) {
    @Transactional
    fun commitOpeningStockChunk(
        variantId: String,
        revision: String,
        sessionId: String,
        chunkIndex: Int,
        totalChunks: Int,
        items: List<OpeningStockChunkItem>,
        uploader: String
    ) {
        val timestamp = Instant.now()

        for (item in items) {
            val batchId = "BAT-OP-${item.partNumber}-$sessionId"
            val existingBatch = batchRepository.findById(batchId).orElse(null)

            if (existingBatch != null) {
                existingBatch.quantityAvailable = item.physicalCount
                existingBatch.initialQuantity = item.physicalCount
                batchRepository.save(existingBatch)
            } else {
                batchRepository.save(
                    BaanBatch(
                        id = batchId,
                        batchNumber = "LOT-OP-${item.partNumber}",
                        partNumber = item.partNumber,
                        initialQuantity = item.physicalCount,
                        quantityAvailable = item.physicalCount,
                        locationName = item.location ?: "Warehouse",
                        perUnitCost = item.cost ?: BigDecimal.ZERO,
                        inwardDate = timestamp,
                        status = "Active"
                    )
                )
            }

            movementRepository.save(
                BaanMovement(
                    id = "MOV-OP-$batchId-${UUID.randomUUID().toString().substring(0, 8)}",
                    movementType = "OPENING_STOCK",
                    partNumber = item.partNumber,
                    batchId = batchId,
                    locationName = item.location ?: "Warehouse",
                    quantity = item.physicalCount,
                    perUnitCost = item.cost ?: BigDecimal.ZERO,
                    reference = "Opening Stock ($variantId $revision)",
                    sessionId = sessionId,
                    userName = uploader,
                    timestamp = timestamp
                )
            )

            // Update or create part master
            val part = partRepository.findById(item.partNumber).orElse(
                BaanPart(
                    partNumber = item.partNumber,
                    name = item.partName ?: item.partNumber,
                    uom = item.uom ?: "Nos"
                )
            )
            part.lastInward = timestamp
            partRepository.save(part)

            notificationService.broadcastInventoryUpdate(item.partNumber)
        }
    }
}
