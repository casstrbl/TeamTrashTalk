export interface HistoryReading {
    triBinID: string
    stream: 'Landfill' | 'Recycling' | 'Compost'
    fill: number
    timestamp: string
}

export const mockHistory: HistoryReading[] = [
    { triBinID: 'TB-148', stream: 'Landfill', fill: 72, timestamp: '2026-10-02 9:00 AM' },
    { triBinID: 'TB-148', stream: 'Landfill', fill: 84, timestamp: '2026-10-02 12:00 PM' },
    { triBinID: 'TB-148', stream: 'Landfill', fill: 97, timestamp: '2026-10-02 3:00 PM' },

    { triBinID: 'TB-148', stream: 'Recycling', fill: 68, timestamp: '2026-10-02 9:00 AM' },
    { triBinID: 'TB-148', stream: 'Recycling', fill: 79, timestamp: '2026-10-02 12:00 PM' },
    { triBinID: 'TB-148', stream: 'Recycling', fill: 91, timestamp: '2026-10-02 3:00 PM' },

    { triBinID: 'TB-148', stream: 'Compost', fill: 61, timestamp: '2026-10-02 9:00 AM' },
    { triBinID: 'TB-148', stream: 'Compost', fill: 74, timestamp: '2026-10-02 12:00 PM' },
    { triBinID: 'TB-148', stream: 'Compost', fill: 88, timestamp: '2026-10-02 3:00 PM' },
]