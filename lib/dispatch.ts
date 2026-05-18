import type { MatchScore, RiderCandidate, VehicleType } from "@/types/domain";

const WEIGHTS = {
  distance: 42,
  online: 22,
  acceptance: 16,
  rating: 14,
  compatibility: 6
};

export function scoreRider(candidate: RiderCandidate, vehicle: VehicleType): MatchScore {
  const inRadius = candidate.distanceKm <= candidate.deliveryRadiusKm;
  const distanceScore = inRadius ? Math.max(0, 1 - candidate.distanceKm / candidate.deliveryRadiusKm) : 0;
  const onlineScore = candidate.online ? 1 : 0;
  const acceptanceScore = candidate.acceptanceRate / 100;
  const ratingScore = Math.min(candidate.rating, 5) / 5;
  const compatibilityScore = candidate.vehicleType === vehicle ? 1 : 0;
  const score =
    distanceScore * WEIGHTS.distance +
    onlineScore * WEIGHTS.online +
    acceptanceScore * WEIGHTS.acceptance +
    ratingScore * WEIGHTS.rating +
    compatibilityScore * WEIGHTS.compatibility;
  const etaMinutes = Math.max(3, Math.round(candidate.distanceKm * 3.2 + (candidate.online ? 2 : 8)));
  const reasons = [
    `${candidate.distanceKm.toFixed(1)} km away`,
    candidate.online ? "online now" : "recently active",
    `${candidate.acceptanceRate}% acceptance`,
    `${candidate.rating.toFixed(1)} rating`
  ];

  return {
    riderId: candidate.id,
    score: Math.round(score * 10) / 10,
    etaMinutes,
    reasons
  };
}

export function rankRiders(candidates: RiderCandidate[], vehicle: VehicleType) {
  return candidates
    .map((candidate) => ({ candidate, match: scoreRider(candidate, vehicle) }))
    .filter(({ candidate }) => candidate.vehicleType === vehicle && candidate.distanceKm <= candidate.deliveryRadiusKm)
    .sort((a, b) => b.match.score - a.match.score);
}

export function sampleRiders(): RiderCandidate[] {
  return [
    {
      id: "rider_tunde",
      fullName: "Tunde Adebayo",
      vehicleType: "bike",
      zone: "Lekki - VI",
      distanceKm: 1.8,
      online: true,
      acceptanceRate: 96,
      rating: 4.92,
      deliveryRadiusKm: 9
    },
    {
      id: "rider_simi",
      fullName: "Simi Okonkwo",
      vehicleType: "car",
      zone: "Ikeja - Ogba",
      distanceKm: 3.1,
      online: true,
      acceptanceRate: 91,
      rating: 4.86,
      deliveryRadiusKm: 12
    },
    {
      id: "rider_kunle",
      fullName: "Kunle Balogun",
      vehicleType: "van",
      zone: "Ota - Abeokuta",
      distanceKm: 4.4,
      online: true,
      acceptanceRate: 88,
      rating: 4.79,
      deliveryRadiusKm: 18
    }
  ];
}
