export const mockBusStops = [
  {
    id: 'mmu',
    name: 'MMU Cyberjaya Bus Stop',
    distance: '120 m away',
    walking: '2 min walk',
    accessible: true,
    crowd: 'Medium',
    type: 'bus',
  },
  {
    id: 'dpulze',
    name: 'DPULZE Bus Stop',
    distance: '350 m away',
    walking: '5 min walk',
    accessible: true,
    crowd: 'Low',
    type: 'bus',
  },
  {
    id: 'terminal',
    name: 'Cyberjaya Transport Terminal',
    distance: '600 m away',
    walking: '8 min walk',
    accessible: true,
    crowd: 'Medium',
    type: 'bus',
  },
  {
    id: 'persiaran',
    name: 'Persiaran Multimedia Bus Stop',
    distance: '300 m away',
    walking: '4 min walk',
    accessible: true,
    crowd: 'Low',
    type: 'bus',
  },
]

export const mockBuses = [
  {
    id: 'T504',
    stopId: 'mmu',
    eta: 4,
    stopsAway: 2,
    status: 'On Time',
    statusTone: 'good',
    crowdLevel: 'Medium',
    wheelchairAccessible: true,
    lowFloorBus: true,
    rampAvailable: true,
    rampWorking: true,
    prioritySeats: true,
    wheelchairSpace: true,
  },
  {
    id: 'T507',
    stopId: 'mmu',
    eta: 8,
    stopsAway: 4,
    status: 'Delayed by 5 min',
    statusTone: 'warning',
    crowdLevel: 'Crowded',
    wheelchairAccessible: true,
    lowFloorBus: true,
    rampAvailable: true,
    rampWorking: true,
    prioritySeats: true,
    wheelchairSpace: false,
  },
  {
    id: 'T509',
    stopId: 'mmu',
    eta: 12,
    stopsAway: 6,
    status: 'Coming',
    statusTone: 'info',
    crowdLevel: 'Low',
    wheelchairAccessible: true,
    lowFloorBus: true,
    rampAvailable: true,
    rampWorking: false,
    prioritySeats: true,
    wheelchairSpace: true,
  },
  {
    id: 'T510',
    stopId: 'dpulze',
    eta: 7,
    stopsAway: 3,
    status: 'On Time',
    statusTone: 'good',
    crowdLevel: 'Low',
    wheelchairAccessible: true,
    lowFloorBus: true,
    rampAvailable: true,
    rampWorking: true,
    prioritySeats: true,
    wheelchairSpace: true,
  },
]

/* ==========================================================================
   MRT MOCK DATA (Putrajaya Line - Cyberjaya Corridor)
   ========================================================================== */
export const mockMrtStations = [
  {
    id: 'mrt-cyberjaya-city',
    name: 'Cyberjaya City Centre MRT',
    line: 'Putrajaya Line',
    distance: '450 m away',
    walking: '6 min walk',
    nextArrival: 3,
    followingArrival: 9,
    status: 'On Time',
    statusTone: 'good',
    liftWorking: true,
    stationCrowd: 'Medium',
    mrtCrowd: 'Crowded',
    wheelchairAccessible: true,
    stepFreeAccess: true,
    type: 'mrt',
  },
  {
    id: 'mrt-cyberjaya-utara',
    name: 'Cyberjaya Utara MRT',
    line: 'Putrajaya Line',
    distance: '1.2 km away',
    walking: '15 min walk',
    nextArrival: 6,
    followingArrival: 14,
    status: 'On Time',
    statusTone: 'good',
    liftWorking: true,
    stationCrowd: 'Low',
    mrtCrowd: 'Low',
    wheelchairAccessible: true,
    stepFreeAccess: true,
    type: 'mrt',
  },
  {
    id: 'mrt-putrajaya-sentral',
    name: 'Putrajaya Sentral MRT',
    line: 'Putrajaya Line',
    distance: '2.5 km away',
    walking: 'Bus transfer recommended',
    nextArrival: 5,
    followingArrival: 12,
    status: 'Delayed by 4 min',
    statusTone: 'warning',
    liftWorking: false, // Lift failure scenario
    stationCrowd: 'Crowded',
    mrtCrowd: 'Very Crowded',
    wheelchairAccessible: false,
    stepFreeAccess: false,
    type: 'mrt',
  },
]

export const mockMrtArrivals = [
  {
    stationId: 'mrt-cyberjaya-city',
    trainNumber: 'MRT-12',
    line: 'Putrajaya Line (Southbound)',
    nextEta: 3,
    followingEta: 9,
    status: 'On Time',
    statusTone: 'good',
    stationCrowd: 'Medium',
    mrtCrowd: 'Crowded',
    liftWorking: true,
  },
  {
    stationId: 'mrt-cyberjaya-utara',
    trainNumber: 'MRT-14',
    line: 'Putrajaya Line (Southbound)',
    nextEta: 6,
    followingEta: 14,
    status: 'On Time',
    statusTone: 'good',
    stationCrowd: 'Low',
    mrtCrowd: 'Low',
    liftWorking: true,
  },
  {
    stationId: 'mrt-putrajaya-sentral',
    trainNumber: 'MRT-08',
    line: 'Putrajaya Line (Northbound)',
    nextEta: 5,
    followingEta: 12,
    status: 'Delayed by 4 min',
    statusTone: 'warning',
    stationCrowd: 'Crowded',
    mrtCrowd: 'Very Crowded',
    liftWorking: false,
  },
]

/* ==========================================================================
   MULTI-MODAL ROUTES (BUS, MRT, BUS + MRT)
   ========================================================================== */
export const mockRoutes = [
  {
    id: 'route-multimodal-1',
    mode: 'bus-mrt',
    title: 'Bus T504 + MRT Putrajaya Line',
    busId: 'T504',
    mrtStation: 'Cyberjaya City Centre MRT',
    from: 'MMU Cyberjaya Bus Stop',
    transferAt: 'Cyberjaya City Centre MRT',
    to: 'DPULZE',
    eta: 4,
    duration: 26,
    walkingDistance: 160,
    numberOfStops: 5,
    trafficLevel: 'Medium',
    busCrowd: 'Medium',
    stationCrowd: 'Medium',
    mrtCrowd: 'Low',
    busAccessibility: { wheelchair: true, rampWorking: true },
    mrtAccessibility: { liftWorking: true },
    accessible: true,
    recommended: true,
  },
  {
    id: 'route-t504',
    mode: 'bus',
    title: 'Direct Bus T504',
    busId: 'T504',
    from: 'MMU Cyberjaya Bus Stop',
    to: 'DPULZE',
    eta: 6,
    duration: 32,
    walkingDistance: 120,
    numberOfStops: 7,
    trafficLevel: 'Heavy',
    crowdLevel: 'Crowded',
    busCrowd: 'Crowded',
    busAccessibility: { wheelchair: true, rampWorking: true },
    accessible: true,
    recommended: false,
  },
  {
    id: 'route-mrt-only',
    mode: 'mrt',
    title: 'MRT Direct Transit',
    mrtStation: 'Cyberjaya City Centre MRT',
    from: 'Cyberjaya City Centre MRT',
    to: 'Cyberjaya Utara MRT',
    eta: 3,
    duration: 14,
    walkingDistance: 220,
    numberOfStops: 2,
    trafficLevel: 'Low',
    stationCrowd: 'Medium',
    mrtCrowd: 'Crowded',
    mrtAccessibility: { liftWorking: true },
    accessible: true,
    recommended: false,
  },
  {
    id: 'route-t507',
    mode: 'bus',
    title: 'Feeder Bus T507',
    busId: 'T507',
    from: 'MMU Cyberjaya Bus Stop',
    to: 'DPULZE',
    eta: 9,
    duration: 31,
    walkingDistance: 0,
    numberOfStops: 8,
    trafficLevel: 'Medium',
    crowdLevel: 'Medium',
    busCrowd: 'Medium',
    busAccessibility: { wheelchair: true, rampWorking: true },
    accessible: true,
    recommended: false,
  },
  {
    id: 'route-lift-alert',
    mode: 'mrt',
    title: 'MRT via Putrajaya Sentral',
    mrtStation: 'Putrajaya Sentral MRT',
    from: 'Putrajaya Sentral MRT',
    to: 'DPULZE',
    eta: 5,
    duration: 29,
    walkingDistance: 280,
    numberOfStops: 4,
    trafficLevel: 'Medium',
    stationCrowd: 'Crowded',
    mrtCrowd: 'Very Crowded',
    mrtAccessibility: { liftWorking: false },
    accessible: false,
    recommended: false,
    warning: 'Station lift unavailable - not step-free',
  },
]

/* ==========================================================================
   FORECAST PATTERNS (BUS & MRT)
   ========================================================================== */
const levels = [
  ['Low', 'Low', 'Low', 4, 22, 'Low'],
  ['Low', 'Medium', 'Low', 5, 23, 'Low'],
  ['Medium', 'Medium', 'Medium', 6, 26, 'Medium'],
  ['Medium', 'Crowded', 'Heavy', 8, 31, 'Medium'],
  ['Crowded', 'Very Crowded', 'Very Heavy', 10, 36, 'Crowded'],
  ['Medium', 'Crowded', 'Heavy', 7, 30, 'Medium'],
  ['Low', 'Medium', 'Medium', 4, 24, 'Low'],
]

const makeForecast = () => {
  const items = []
  let hour = 11
  let minute = 0
  for (let i = 0; i < 29; i += 1) {
    const labelHour = hour > 12 ? hour - 12 : hour
    const period = hour >= 12 ? 'PM' : 'AM'
    const label = `${labelHour}:${String(minute).padStart(2, '0')} ${period}`
    const pattern = levels[i % levels.length]
    items.push({
      id: `${hour}-${minute}`,
      label,
      shortLabel: `${labelHour}:${String(minute).padStart(2, '0')}`,
      stopCrowd: pattern[0],
      busCrowd: pattern[1],
      traffic: pattern[2],
      wait: pattern[3],
      journey: pattern[4],
      destinationCrowd: pattern[5],
      type: 'bus',
    })
    minute += 15
    if (minute === 60) {
      minute = 0
      hour += 1
    }
  }
  return items
}

const mrtLevels = [
  ['Low', 'Low', 3, 15, true],
  ['Low', 'Medium', 3, 16, true],
  ['Medium', 'Medium', 4, 18, true],
  ['Medium', 'Crowded', 5, 20, true],
  ['Crowded', 'Very Crowded', 6, 22, true],
  ['Very Crowded', 'Very Crowded', 5, 21, true],
  ['Medium', 'Crowded', 4, 18, true],
  ['Low', 'Medium', 3, 16, true],
]

const makeMrtForecast = () => {
  const items = []
  let hour = 11
  let minute = 0
  for (let i = 0; i < 29; i += 1) {
    const labelHour = hour > 12 ? hour - 12 : hour
    const period = hour >= 12 ? 'PM' : 'AM'
    const label = `${labelHour}:${String(minute).padStart(2, '0')} ${period}`
    const pattern = mrtLevels[i % mrtLevels.length]
    items.push({
      id: `mrt-${hour}-${minute}`,
      label,
      shortLabel: `${labelHour}:${String(minute).padStart(2, '0')}`,
      stationCrowd: pattern[0],
      mrtCrowd: pattern[1],
      wait: pattern[2],
      journey: pattern[3],
      liftWorking: pattern[4],
      nextArrival: pattern[2],
      type: 'mrt',
    })
    minute += 15
    if (minute === 60) {
      minute = 0
      hour += 1
    }
  }
  return items
}

export const mockTrafficForecast = makeForecast()
export const mockCrowdForecast = mockTrafficForecast
export const mockMrtForecast = makeMrtForecast()

/* ==========================================================================
   ALERTS (BUS + MRT)
   ========================================================================== */
export const mockAlerts = [
  {
    id: 'a1',
    icon: '🔴',
    type: 'Bus Service Disruption',
    mode: 'bus',
    location: 'MMU Cyberjaya',
    time: '10:42 AM',
    description: 'T504 is temporarily unavailable due to a bus breakdown.',
    urgent: true,
  },
  {
    id: 'm1',
    icon: '♿',
    type: 'MRT Lift Unavailable',
    mode: 'mrt',
    location: 'Putrajaya Sentral MRT',
    time: '10:38 AM',
    description: 'Concourse to platform lift is temporarily out of service for repair. Not step-free.',
    urgent: true,
  },
  {
    id: 'a2',
    icon: '🚗',
    type: 'Corridor Traffic Accident',
    mode: 'bus',
    location: 'Near DPULZE',
    time: '10:35 AM',
    description: 'Slow traffic is expected around the shopping centre entrance affecting feeder buses.',
    urgent: true,
  },
  {
    id: 'm2',
    icon: '🚇',
    type: 'MRT Delay Advisory',
    mode: 'mrt',
    location: 'Cyberjaya City Centre MRT',
    time: '10:25 AM',
    description: 'Putrajaya Line southbound trains delayed by approximately 4 minutes due to signaling calibration.',
    urgent: false,
  },
  {
    id: 'a3',
    icon: '🚌',
    type: 'Bus Delay',
    mode: 'bus',
    location: 'Persiaran Multimedia',
    time: '10:20 AM',
    description: 'T507 is delayed by about 5 minutes.',
    urgent: false,
  },
  {
    id: 'm3',
    icon: '👥',
    type: 'MRT Station Crowded',
    mode: 'mrt',
    location: 'Cyberjaya City Centre MRT',
    time: '10:05 AM',
    description: 'High passenger transfer volume at concourse. Extra boarding time advised for wheelchair passengers.',
    urgent: false,
  },
  {
    id: 'a4',
    icon: '♿',
    type: 'Ramp Unavailable',
    mode: 'bus',
    location: 'Cyberjaya Transport Terminal',
    time: '9:50 AM',
    description: 'The ramp on one T509 bus is reported unavailable.',
    urgent: true,
  },
]

export const mockAlternatives = [
  {
    id: 'alt-mrt-combo',
    title: 'Bus T504 + MRT Connection',
    mode: 'bus-mrt',
    busId: 'T504',
    mrtStation: 'Cyberjaya City Centre MRT',
    stop: 'MMU Cyberjaya Bus Stop',
    wait: 4,
    walking: '160 m',
    total: 26,
    crowd: 'Low',
    accessible: true,
    rampWorking: true,
    liftWorking: true,
    prioritySeats: true,
    recommended: true,
  },
  {
    id: 'alt1',
    title: 'Next Feeder Bus',
    mode: 'bus',
    busId: 'T507',
    stop: 'MMU Cyberjaya Bus Stop',
    wait: 9,
    walking: '0 m',
    total: 31,
    crowd: 'Medium',
    accessible: true,
    rampWorking: true,
    prioritySeats: true,
    recommended: false,
  },
  {
    id: 'alt2',
    title: 'Nearby Alternative Bus Stop',
    mode: 'bus',
    busId: 'T509',
    stop: 'Persiaran Multimedia Bus Stop',
    wait: 5,
    walking: '250 m / 4 min',
    total: 27,
    crowd: 'Medium',
    accessible: true,
    rampWorking: true,
    prioritySeats: true,
    recommended: false,
  },
  {
    id: 'alt3',
    title: 'Alternative Feeder Line',
    mode: 'bus',
    busId: 'T510',
    stop: 'Nearby Bus Stop B',
    wait: 7,
    walking: '180 m',
    total: 25,
    crowd: 'Low',
    accessible: true,
    rampWorking: true,
    prioritySeats: true,
    recommended: false,
  },
]

export const mockRewards = {
  points: 320,
  submitted: 8,
  verified: 5,
  activities: [
    { id: 'r1', points: 50, text: 'Broken ramp report verified' },
    { id: 'r2', points: 30, text: 'Crowded bus report verified' },
    { id: 'r3', points: 50, text: 'MRT station lift verified operational' },
  ],
}

export const travelNeeds = [
  'Wheelchair access',
  'Step-free MRT lift required',
  'Limited walking',
  'Priority seating',
  'Pregnancy assistance',
  'Elderly assistance',
  'Avoid crowded transit',
  'Bus ramp required',
  'Extra boarding time',
]

export const savedPlaces = ['Home', 'MMU', 'DPULZE', 'Cyberjaya City Centre MRT']
