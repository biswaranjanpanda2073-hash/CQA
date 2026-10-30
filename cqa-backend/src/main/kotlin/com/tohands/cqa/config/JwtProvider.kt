package com.tohands.cqa.config

import io.jsonwebtoken.Claims
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.*
import javax.crypto.SecretKey

@Component
class JwtProvider(
    @Value("\${app.jwt.secret}") private val jwtSecret: String,
    @Value("\${app.jwt.expiration-ms}") private val jwtExpirationMs: Long
) {
    private val key: SecretKey by lazy {
        val secretBytes = if (jwtSecret.length < 32) {
            jwtSecret.padEnd(32, '0').toByteArray(StandardCharsets.UTF_8)
        } else {
            jwtSecret.toByteArray(StandardCharsets.UTF_8)
        }
        Keys.hmacShaKeyFor(secretBytes)
    }

    fun generateToken(userId: String, role: String, name: String): String {
        val now = Date()
        val expiryDate = Date(now.time + jwtExpirationMs)

        return Jwts.builder()
            .subject(userId)
            .claim("role", role)
            .claim("name", name)
            .issuedAt(now)
            .expiration(expiryDate)
            .signWith(key)
            .compact()
    }

    fun getUserIdFromToken(token: String): String {
        return getClaims(token).subject
    }

    fun getRoleFromToken(token: String): String? {
        return getClaims(token)["role"] as? String
    }

    fun validateToken(token: String): Boolean {
        return try {
            val claims = getClaims(token)
            !claims.expiration.before(Date())
        } catch (e: Exception) {
            false
        }
    }

    private fun getClaims(token: String): Claims {
        return Jwts.parser()
            .verifyWith(key)
            .build()
            .parseSignedClaims(token)
            .payload
    }
}
