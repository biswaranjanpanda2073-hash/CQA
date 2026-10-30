package com.tohands.cqa.controller

import com.tohands.cqa.model.*
import com.tohands.cqa.repository.*
import com.tohands.cqa.service.*
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.*
import java.security.Principal

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val authService: AuthService
) {
    @PostMapping("/login")
    fun login(@RequestBody request: LoginRequest): ResponseEntity<LoginResponse> {
        return ResponseEntity.ok(authService.login(request))
    }

    @GetMapping("/me")
    fun getMe(principal: Principal?): ResponseEntity<User> {
        val uid = principal?.name ?: throw IllegalArgumentException("Unauthorized")
        return ResponseEntity.ok(authService.getUser(uid))
    }
}

@RestController
@RequestMapping("/api/station")
class StationController(
    private val stationService: StationService,
    private val deviceRepository: DeviceRepository,
    private val historyRepository: DeviceStationHistoryRepository
) {
    @PostMapping("/process")
    fun process(@RequestBody request: StationProcessRequest): ResponseEntity<Device> {
        return ResponseEntity.ok(stationService.processStation(request))
    }

    @PostMapping("/unhold")
    fun unhold(
        @RequestParam serialNumber: String,
        @RequestParam reason: String,
        principal: Principal?
    ): ResponseEntity<Device> {
        val operatorId = principal?.name ?: "System"
        return ResponseEntity.ok(stationService.unholdSerial(serialNumber, reason, operatorId))
    }

    @GetMapping("/devices")
    fun listDevices(): ResponseEntity<List<Device>> {
        return ResponseEntity.ok(deviceRepository.findAll())
    }

    @GetMapping("/devices/{serialNumber}")
    fun getDevice(@PathVariable serialNumber: String): ResponseEntity<Map<String, Any>> {
        val device = deviceRepository.findById(serialNumber.trim().uppercase())
            .orElseThrow { IllegalArgumentException("Device not found") }
        val history = historyRepository.findBySerialNumberOrderByTimestampDesc(device.serialNumber)
        return ResponseEntity.ok(mapOf("device" to device, "history" to history))
    }
}

data class OpeningStockChunkRequest(
    val variantId: String,
    val revision: String,
    val sessionId: String,
    val chunkIndex: Int,
    val totalChunks: Int,
    val items: List<OpeningStockChunkItem>
)

@RestController
@RequestMapping("/api/baan")
class BaanController(
    private val inventoryService: BaanInventoryService,
    private val partRepository: BaanPartRepository,
    private val batchRepository: BaanBatchRepository,
    private val movementRepository: BaanMovementRepository,
    private val discrepancyRepository: InventoryDiscrepancyRepository
) {
    @GetMapping("/parts")
    fun listParts(): ResponseEntity<List<BaanPart>> = ResponseEntity.ok(partRepository.findAll())

    @GetMapping("/batches")
    fun listBatches(): ResponseEntity<List<BaanBatch>> = ResponseEntity.ok(batchRepository.findAll())

    @GetMapping("/movements")
    fun listMovements(): ResponseEntity<List<BaanMovement>> = ResponseEntity.ok(movementRepository.findTop100ByOrderByTimestampDesc())

    @GetMapping("/discrepancies")
    fun listDiscrepancies(): ResponseEntity<List<InventoryDiscrepancy>> = ResponseEntity.ok(discrepancyRepository.findAllByOrderByCreatedAtDesc())

    @PostMapping("/opening-stock/chunk")
    fun commitChunk(
        @RequestBody req: OpeningStockChunkRequest,
        principal: Principal?
    ): ResponseEntity<Map<String, Any>> {
        val uploader = principal?.name ?: "System"
        inventoryService.commitOpeningStockChunk(
            variantId = req.variantId,
            revision = req.revision,
            sessionId = req.sessionId,
            chunkIndex = req.chunkIndex,
            totalChunks = req.totalChunks,
            items = req.items,
            uploader = uploader
        )
        return ResponseEntity.ok(mapOf("success" to true, "chunkIndex" to req.chunkIndex))
    }
}

@RestController
@RequestMapping("/api/bom")
class BomController(
    private val headerRepository: BomHeaderRepository,
    private val revisionRepository: BomRevisionRepository,
    private val itemRepository: BomItemRepository
) {
    @GetMapping("/headers")
    fun listHeaders(): ResponseEntity<List<BomHeader>> = ResponseEntity.ok(headerRepository.findAll())

    @GetMapping("/revisions")
    fun listRevisions(@RequestParam(required = false) variantId: String?): ResponseEntity<List<BomRevision>> {
        return if (variantId != null) {
            ResponseEntity.ok(revisionRepository.findByVariantIdOrderByRevisionDesc(variantId))
        } else {
            ResponseEntity.ok(revisionRepository.findAll())
        }
    }

    @GetMapping("/revisions/{revisionId}/items")
    fun getRevisionItems(@PathVariable revisionId: String): ResponseEntity<List<BomItem>> {
        return ResponseEntity.ok(itemRepository.findByRevisionIdOrderBySrNoAsc(revisionId))
    }
}

@RestController
@RequestMapping("/api/bootstrap")
class BootstrapController(
    private val deviceRepository: DeviceRepository,
    private val partRepository: BaanPartRepository,
    private val batchRepository: BaanBatchRepository,
    private val headerRepository: BomHeaderRepository,
    private val revisionRepository: BomRevisionRepository,
    private val discrepancyRepository: InventoryDiscrepancyRepository
) {
    @GetMapping
    fun getBootstrapData(): ResponseEntity<Map<String, Any>> {
        val data = mapOf(
            "devices" to deviceRepository.findAll().associateBy { it.serialNumber },
            "baan" to mapOf(
                "parts" to partRepository.findAll().associateBy { it.partNumber },
                "batches" to batchRepository.findAll().associateBy { it.id },
                "discrepancies" to discrepancyRepository.findAllByOrderByCreatedAtDesc().associateBy { it.ticketId }
            ),
            "bom" to mapOf(
                "headers" to headerRepository.findAll().associateBy { it.variantId },
                "revisions" to revisionRepository.findAll().associateBy { it.id }
            )
        )
        return ResponseEntity.ok(data)
    }
}
