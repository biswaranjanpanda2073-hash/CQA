package com.tohands.cqa.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "users")
data class User(
    @Id
    val id: String = "",
    var name: String = "",
    var email: String? = null,
    var passwordHash: String = "",
    var passwordSalt: String? = null,
    var role: String = "Operator",
    @Column(columnDefinition = "jsonb")
    var stations: String = "[]",
    var isActive: Boolean = true,
    val createdAt: Instant = Instant.now(),
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "devices")
data class Device(
    @Id
    val serialNumber: String = "",
    var projectId: String? = "CALCULATOR",
    var currentStationId: Int? = 1,
    var stationName: String = "Station 1",
    var status: String = "In Progress",
    var stage: String = "Station 1",
    var failCount: Int = 0,
    var isHeld: Boolean = false,
    var holdReason: String? = null,
    var lastOperatorId: String? = null,
    @Column(columnDefinition = "jsonb")
    var testRecords: String = "{}",
    val createdAt: Instant = Instant.now(),
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "device_station_history")
data class DeviceStationHistory(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,
    val serialNumber: String = "",
    val stationId: Int = 0,
    val stationName: String = "",
    val operatorId: String? = null,
    val operatorName: String? = null,
    val status: String = "",
    val remarks: String? = null,
    @Column(columnDefinition = "jsonb")
    val testData: String? = null,
    val timestamp: Instant = Instant.now()
)

@Entity
@Table(name = "baan_parts")
data class BaanPart(
    @Id
    val partNumber: String = "",
    var name: String = "",
    var description: String? = null,
    var category: String = "Mechanical",
    var uom: String = "Nos",
    var minStockLevel: BigDecimal = BigDecimal.ZERO,
    var lastInward: Instant? = null,
    val createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "baan_batches")
data class BaanBatch(
    @Id
    val id: String = "",
    var batchNumber: String = "",
    val partNumber: String = "",
    var initialQuantity: BigDecimal = BigDecimal.ZERO,
    var quantityAvailable: BigDecimal = BigDecimal.ZERO,
    var locationCode: String? = null,
    var locationName: String? = null,
    var perUnitCost: BigDecimal = BigDecimal.ZERO,
    val inwardDate: Instant = Instant.now(),
    var status: String = "Active"
)

@Entity
@Table(name = "baan_inventory_movements")
data class BaanMovement(
    @Id
    val id: String = "",
    val movementType: String = "",
    val partNumber: String = "",
    val batchId: String? = null,
    val locationCode: String? = null,
    val locationName: String? = null,
    val quantity: BigDecimal = BigDecimal.ZERO,
    val perUnitCost: BigDecimal = BigDecimal.ZERO,
    val reference: String? = null,
    val sessionId: String? = null,
    val userName: String = "System",
    val timestamp: Instant = Instant.now()
)

@Entity
@Table(name = "bom_headers")
data class BomHeader(
    @Id
    val variantId: String = "",
    var variantName: String = "",
    var category: String = "CALCULATOR",
    var activeRevision: String = "REV-01",
    var description: String? = null,
    var createdBy: String = "",
    val createdAt: Instant = Instant.now(),
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "bom_revisions")
data class BomRevision(
    @Id
    val id: String = "",
    val variantId: String = "",
    val revision: String = "",
    var changeNotes: String? = null,
    var isLocked: Boolean = true,
    var itemCount: Int = 0,
    val uploadedBy: String = "",
    val uploadedAt: Instant = Instant.now()
)

@Entity
@Table(name = "bom_items")
data class BomItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,
    val revisionId: String = "",
    val srNo: Int = 0,
    val partNumber: String = "",
    val partName: String = "",
    val category: String = "",
    val qtyPerUnit: BigDecimal = BigDecimal.ONE,
    val uom: String = "Nos",
    val processStage: String? = null,
    val stationId: Int? = null,
    val remarks: String? = null
)

@Entity
@Table(name = "baan_inventory_locks")
data class InventoryLock(
    @Id
    val sku: String = "",
    val lockedByUid: String = "",
    val lockedByName: String = "",
    val sessionId: String = "",
    val fencingToken: Long = 1,
    val expiresAt: Instant = Instant.now().plusSeconds(900),
    val lockedAt: Instant = Instant.now()
)

@Entity
@Table(name = "baan_inventory_discrepancies")
data class InventoryDiscrepancy(
    @Id
    val ticketId: String = "",
    val sku: String = "",
    val partName: String = "",
    val systemStock: BigDecimal = BigDecimal.ZERO,
    val physicalCount: BigDecimal = BigDecimal.ZERO,
    val delta: BigDecimal = BigDecimal.ZERO,
    val reason: String? = null,
    var status: String = "PENDING_FIRST_APPROVAL",
    val createdBy: String = "",
    var firstApproverUid: String? = null,
    var firstApproverName: String? = null,
    var firstApprovedAt: Instant? = null,
    var secondApproverUid: String? = null,
    var secondApproverName: String? = null,
    var secondApprovedAt: Instant? = null,
    var resolvedAt: Instant? = null,
    var resolvedBy: String? = null,
    val createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "audit_logs")
data class AuditLog(
    @Id
    val id: String = "",
    val actorId: String = "",
    val actorName: String? = null,
    val actorRole: String? = null,
    val action: String = "",
    val entity: String = "",
    val entityId: String? = null,
    val reason: String? = null,
    val remarks: String? = null,
    val clientIp: String? = null,
    val timestamp: Instant = Instant.now()
)
