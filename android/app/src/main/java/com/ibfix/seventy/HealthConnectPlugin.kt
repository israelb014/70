package com.ibfix.seventy

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Read-only Health Connect access for "70": daily steps, sleep sessions and cycling exercise sessions
 * (with their distance). Nothing is written to Health Connect and nothing leaves the phone.
 *
 * JS: getStatus() → { available, granted: ["steps" | "sleep" | "exercise"] }
 *     connect() → { granted } (Health Connect's permission screen)
 *     readData({ startTime, endTime }) → { steps: [{ date, count }], sleep: [{ id, startTime, endTime }],
 *                                          exercise: [{ id, type, startTime, endTime, distanceMeters }], granted }
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val stepsPerm = HealthPermission.getReadPermission(StepsRecord::class)
    private val sleepPerm = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val exercisePerm = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    private val distancePerm = HealthPermission.getReadPermission(DistanceRecord::class)
    private val permissions = setOf(stepsPerm, sleepPerm, exercisePerm, distancePerm)

    private fun available(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    private fun typesOf(granted: Set<String>): JSArray {
        val out = JSArray()
        if (stepsPerm in granted) out.put("steps")
        if (sleepPerm in granted) out.put("sleep")
        if (exercisePerm in granted) out.put("exercise")
        return out
    }

    private fun resolveGranted(call: PluginCall) {
        if (!available()) {
            call.resolve(JSObject().put("available", false).put("granted", JSArray()))
            return
        }
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                call.resolve(JSObject().put("available", true).put("granted", typesOf(granted)))
            } catch (e: Exception) {
                call.resolve(JSObject().put("available", true).put("granted", JSArray()))
            }
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) = resolveGranted(call)

    @PluginMethod
    fun connect(call: PluginCall) {
        if (!available()) {
            call.resolve(JSObject().put("available", false).put("granted", JSArray()))
            return
        }
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)
        startActivityForResult(call, intent, "permissionsResult")
    }

    @ActivityCallback
    fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call != null) resolveGranted(call)
    }

    @PluginMethod
    fun readData(call: PluginCall) {
        if (!available()) {
            call.reject("Health Connect is not available")
            return
        }
        val start = Instant.ofEpochMilli(call.getLong("startTime") ?: (System.currentTimeMillis() - 14L * 86_400_000L))
        val end = Instant.ofEpochMilli(call.getLong("endTime") ?: System.currentTimeMillis())
        scope.launch(Dispatchers.IO) {
            val out = JSObject()
            try {
                val hc = client()
                val granted = hc.permissionController.getGrantedPermissions()
                out.put("granted", typesOf(granted))
                out.put("steps", if (stepsPerm in granted) readSteps(hc, start, end) else JSArray())
                out.put("sleep", if (sleepPerm in granted) readSleep(hc, start, end) else JSArray())
                out.put("exercise", if (exercisePerm in granted) readExercise(hc, start, end, distancePerm in granted) else JSArray())
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("Health Connect read failed", e)
            }
        }
    }

    /** Daily step totals (local days), deduplicated by Health Connect's aggregation. */
    private suspend fun readSteps(hc: HealthConnectClient, start: Instant, end: Instant): JSArray {
        val zone = ZoneId.systemDefault()
        val rows = hc.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(LocalDateTime.ofInstant(start, zone), LocalDateTime.ofInstant(end, zone)),
                timeRangeSlicer = Period.ofDays(1),
            ),
        )
        val out = JSArray()
        for (row in rows) {
            val count = row.result[StepsRecord.COUNT_TOTAL] ?: continue
            out.put(JSObject().put("date", row.startTime.toLocalDate().toString()).put("count", count))
        }
        return out
    }

    private suspend fun <T : Record> readAll(hc: HealthConnectClient, type: KClass<T>, start: Instant, end: Instant): List<T> {
        val all = mutableListOf<T>()
        var token: String? = null
        do {
            val page = hc.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(start, end), pageToken = token))
            all.addAll(page.records)
            token = page.pageToken
        } while (!token.isNullOrEmpty())
        return all
    }

    private suspend fun readSleep(hc: HealthConnectClient, start: Instant, end: Instant): JSArray {
        val out = JSArray()
        for (s in readAll(hc, SleepSessionRecord::class, start, end)) {
            out.put(JSObject().put("id", s.metadata.id).put("startTime", s.startTime.toEpochMilli()).put("endTime", s.endTime.toEpochMilli()))
        }
        return out
    }

    private suspend fun readExercise(hc: HealthConnectClient, start: Instant, end: Instant, withDistance: Boolean): JSArray {
        val out = JSArray()
        for (e in readAll(hc, ExerciseSessionRecord::class, start, end)) {
            val type = when (e.exerciseType) {
                ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
                ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "biking_stationary"
                else -> continue // only cycling becomes a ride
            }
            var meters = 0.0
            if (withDistance) {
                try {
                    val agg = hc.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), TimeRangeFilter.between(e.startTime, e.endTime)))
                    meters = agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
                } catch (_: Exception) { /* no distance */ }
            }
            out.put(
                JSObject().put("id", e.metadata.id).put("type", type)
                    .put("startTime", e.startTime.toEpochMilli()).put("endTime", e.endTime.toEpochMilli())
                    .put("distanceMeters", meters),
            )
        }
        return out
    }
}
