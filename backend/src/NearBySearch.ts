type NearbySearchResult = {
    status?: string
    results?: Array<{
        name?: string
        place_id?: string
        geometry?: { location?: { lat?: number; lng?: number } }
    }>
}

export async function nearBySearch(
    latitude: number,
    longitude: number,
    apiKey: string
): Promise<Array<{ name: string; placeId?: string }>> {
    const url = new URL(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?key=${apiKey}&language=ja&location=${latitude},${longitude}&rankby=distance`)

    const res = await fetch(url.toString())
    if (!res.ok) {
        throw new Error(`Nearby Search failed: ${res.status}`)
    }

    const data = (await res.json()) as NearbySearchResult
    const results = data.results ?? []
    return results
        .filter(item => typeof item.name === 'string')
        .slice(0, 6)
        .map(item => ({ name: item.name as string, placeId: item.place_id }))
}
