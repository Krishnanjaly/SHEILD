package com.anonymous.SHEILDApp

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class FrameAnalysisModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FrameAnalysisModule"

    @ReactMethod
    fun analyzeBase64Frame(base64Frame: String, promise: Promise) {
        try {
            val cleanedBase64 = base64Frame.substringAfter(",", base64Frame)
            val bytes = Base64.decode(cleanedBase64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

            if (bitmap == null) {
                promise.reject("FRAME_DECODE_FAILED", "Unable to decode frame")
                return
            }

            val result = analyzeBitmap(bitmap)
            bitmap.recycle()
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("FRAME_ANALYSIS_FAILED", error)
        }
    }

    @ReactMethod
    fun analyzeVideoFile(videoUri: String, promise: Promise) {
        val retriever = MediaMetadataRetriever()

        try {
            retriever.setDataSource(reactApplicationContext, Uri.parse(videoUri))
            val durationMs = retriever
                .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull()
                ?: 0L

            val sampleTimesUs = if (durationMs > 0L) {
                val maxFrameTimeUs = maxOf(0L, (durationMs - 100L) * 1000L)
                listOf(500_000L, 1_500_000L, 2_500_000L, 3_500_000L, 4_500_000L)
                    .map { minOf(it, maxFrameTimeUs) }
            } else {
                listOf(0L)
            }

            val frameAnalyses = sampleTimesUs.mapNotNull { timeUs ->
                retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { frame ->
                    val analysis = analyzeBitmap(frame)
                    frame.recycle()
                    analysis
                }
            }

            if (frameAnalyses.isEmpty()) {
                promise.reject("VIDEO_FRAME_ANALYSIS_FAILED", "Unable to extract frames from video")
                return
            }

            val frameCount = frameAnalyses.size
            val blankFrameCount = frameAnalyses.count { it.getBoolean("isBlankOrUniform") }
            val averageBrightness = frameAnalyses.sumOf { it.getDouble("averageBrightness") } / frameCount
            val variance = frameAnalyses.sumOf { it.getDouble("variance") } / frameCount
            val pixelVariance = frameAnalyses.sumOf { it.getDouble("pixelVariance") } / frameCount
            val isLowBrightness = averageBrightness < 90.0
            val isLowVariation = variance < 500.0 || pixelVariance < 2500.0
            val isBlankOrUniform = blankFrameCount >= maxOf(1, frameCount - 1) || isLowBrightness || isLowVariation

            val result = buildResultMap(
                averageBrightness,
                variance,
                pixelVariance,
                isLowBrightness,
                isLowVariation,
                isBlankOrUniform,
                frameCount
            )
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("VIDEO_ANALYSIS_FAILED", error)
        } finally {
            retriever.release()
        }
    }

    private fun analyzeBitmap(bitmap: Bitmap): WritableMap {
        val width = bitmap.width
        val height = bitmap.height
        val stepX = maxOf(1, width / 64)
        val stepY = maxOf(1, height / 64)
        var count = 0
        var sum = 0.0
        var sumSquares = 0.0
        var redSum = 0.0
        var greenSum = 0.0
        var blueSum = 0.0
        var redSquares = 0.0
        var greenSquares = 0.0
        var blueSquares = 0.0

        var y = 0
        while (y < height) {
            var x = 0
            while (x < width) {
                val pixel = bitmap.getPixel(x, y)
                val red = (pixel shr 16) and 0xff
                val green = (pixel shr 8) and 0xff
                val blue = pixel and 0xff
                val brightness = (0.299 * red) + (0.587 * green) + (0.114 * blue)

                sum += brightness
                sumSquares += brightness * brightness
                redSum += red
                greenSum += green
                blueSum += blue
                redSquares += red * red
                greenSquares += green * green
                blueSquares += blue * blue
                count += 1
                x += stepX
            }
            y += stepY
        }

        val averageBrightness = if (count > 0) sum / count else 0.0
        val variance = if (count > 0) (sumSquares / count) - (averageBrightness * averageBrightness) else 0.0
        val redMean = if (count > 0) redSum / count else 0.0
        val greenMean = if (count > 0) greenSum / count else 0.0
        val blueMean = if (count > 0) blueSum / count else 0.0
        val pixelVariance = if (count > 0) {
            ((redSquares / count) - (redMean * redMean)) +
                ((greenSquares / count) - (greenMean * greenMean)) +
                ((blueSquares / count) - (blueMean * blueMean))
        } else {
            0.0
        }
        val isLowBrightness = averageBrightness < 90.0
        val isLowVariation = variance < 500.0 || pixelVariance < 2500.0
        val isBlankOrUniform = isLowBrightness || isLowVariation

        return buildResultMap(
            averageBrightness,
            variance,
            pixelVariance,
            isLowBrightness,
            isLowVariation,
            isBlankOrUniform,
            count
        )
    }

    private fun buildResultMap(
        averageBrightness: Double,
        variance: Double,
        pixelVariance: Double,
        isLowBrightness: Boolean,
        isLowVariation: Boolean,
        isBlankOrUniform: Boolean,
        sampleCount: Int
    ): WritableMap {
        val result = Arguments.createMap()
        result.putDouble("averageBrightness", averageBrightness)
        result.putDouble("variance", variance)
        result.putDouble("pixelVariance", pixelVariance)
        result.putBoolean("isLowBrightness", isLowBrightness)
        result.putBoolean("isLowVariation", isLowVariation)
        result.putBoolean("isBlankOrUniform", isBlankOrUniform)
        result.putInt("sampleCount", sampleCount)
        return result
    }
}
