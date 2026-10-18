export const backendFieldMap = {
    id: 'triBinID',
    location: 'location',
    lat: 'binCoordinatesX',
    lng: 'binCoordinatesY',
    landfill: 'landfill',
    recycling: 'recycle',
    compost: 'compost',
    binType: 'binType',
    wasteHeight: 'wasteHeight',
    fill: 'percentFull',
    sensorStatus: 'active',
    lastUpdated: 'timestamp',
} as const