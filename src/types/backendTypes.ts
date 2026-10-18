export type BinType = 'LANDFILL' | 'RECYCLING' | 'COMPOST'

export type BinStatus = 'GREEN' | 'YELLOW' | 'RED'

export type SensorType = 'ULTRASONIC' | 'WEIGHT'

export interface BackendBin {
    binID: number
    triBinID: number
    binType: BinType
    wasteHeight: number
}

export interface BackendTriBin {
    triBinID: number
    landfill: BackendBin
    recycle: BackendBin
    compost: BackendBin
    location: string
    binCoordinatesX: number
    binCoordinatesY: number
}

export interface BackendSensor {
    sensorID: number
    binID: number
    sensortype: SensorType
    active: boolean
}

export interface BackendSensorReading {
    sensorID: number
    value: number
    unit: string
    timestamp: string
}