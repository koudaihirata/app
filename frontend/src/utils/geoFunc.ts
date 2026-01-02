export const geoOptions = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0,
}

export function geoSuccess(pos: GeolocationPosition) {
    const crd = pos.coords;

    console.log("現在の位置:");
    console.log(`緯度: ${crd.latitude}`);
    console.log(`軽度: ${crd.longitude}`);
    console.log(`テスト: ${pos}`);
    console.log(`テスト: ${crd}`);
}

export function geoError(err: GeolocationPositionError) {
    console.warn(`ERROR(${err.code}): ${err.message}`);
}