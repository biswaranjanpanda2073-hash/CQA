package com.tohands.cqa.repository

import com.tohands.cqa.model.*
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.time.Instant

@Repository
interface UserRepository : JpaRepository<User, String> {
    fun findByEmail(email: String): User?
}

@Repository
interface DeviceRepository : JpaRepository<Device, String> {
    fun findByProjectId(projectId: String): List<Device>
    fun findByStatus(status: String): List<Device>
    fun findByCurrentStationId(stationId: Int): List<Device>
}

@Repository
interface DeviceStationHistoryRepository : JpaRepository<DeviceStationHistory, Long> {
    fun findBySerialNumberOrderByTimestampDesc(serialNumber: String): List<DeviceStationHistory>
}

@Repository
interface BaanPartRepository : JpaRepository<BaanPart, String>

@Repository
interface BaanBatchRepository : JpaRepository<BaanBatch, String> {
    fun findByPartNumber(partNumber: String): List<BaanBatch>
    fun findByPartNumberAndQuantityAvailableGreaterThanOrderByInwardDateAsc(
        partNumber: String,
        minQty: BigDecimal = BigDecimal.ZERO
    ): List<BaanBatch>
}

@Repository
interface BaanMovementRepository : JpaRepository<BaanMovement, String> {
    fun findByPartNumberOrderByTimestampDesc(partNumber: String): List<BaanMovement>
    fun findTop100ByOrderByTimestampDesc(): List<BaanMovement>
}

@Repository
interface BomHeaderRepository : JpaRepository<BomHeader, String>

@Repository
interface BomRevisionRepository : JpaRepository<BomRevision, String> {
    fun findByVariantIdOrderByRevisionDesc(variantId: String): List<BomRevision>
}

@Repository
interface BomItemRepository : JpaRepository<BomItem, Long> {
    fun findByRevisionIdOrderBySrNoAsc(revisionId: String): List<BomItem>
}

@Repository
interface InventoryLockRepository : JpaRepository<InventoryLock, String> {
    fun findBySkuAndExpiresAtAfter(sku: String, now: Instant): InventoryLock?
}

@Repository
interface InventoryDiscrepancyRepository : JpaRepository<InventoryDiscrepancy, String> {
    fun findAllByOrderByCreatedAtDesc(): List<InventoryDiscrepancy>
}

@Repository
interface AuditLogRepository : JpaRepository<AuditLog, String> {
    fun findTop100ByOrderByTimestampDesc(): List<AuditLog>
}
