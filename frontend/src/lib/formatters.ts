export function formatDuration(seconds: string | number) {
    if (!seconds) return ""
    const s = typeof seconds === 'string' ? parseInt(seconds.replace('s', '')) : seconds
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    const remainingM = m % 60
    if (remainingM === 0) return `${h} hr`
    return `${h} hr ${remainingM} min`
}

export function formatDistance(meters: number) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`
    }
    return `${meters} m`
}
