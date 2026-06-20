/**
 * Typed shapes for the subset of the Strava API v3 responses this CLI consumes.
 * Only fields that are useful for answering questions about an athlete are
 * modeled; unknown fields are tolerated (responses are passed through as-is in
 * JSON mode).
 *
 * Reference: https://developers.strava.com/docs/reference/
 */

export interface AthleteGear {
  id: string;
  primary: boolean;
  name: string;
  resource_state: number;
  distance: number; // meters
}

export interface SummaryAthlete {
  id: number;
  username: string | null;
  firstname: string;
  lastname: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: 'M' | 'F' | null;
  premium: boolean;
  summit: boolean;
  created_at: string;
  updated_at: string;
  weight: number | null; // kilograms
  profile: string;
  profile_medium: string;
}

export interface DetailedAthlete extends SummaryAthlete {
  follower_count: number;
  friend_count: number;
  measurement_preference: 'feet' | 'meters';
  ftp: number | null;
  bikes: AthleteGear[];
  shoes: AthleteGear[];
}

export type SportType =
  | 'Run'
  | 'TrailRun'
  | 'Ride'
  | 'GravelRide'
  | 'MountainBikeRide'
  | 'VirtualRide'
  | 'Walk'
  | 'Hike'
  | 'Swim'
  | 'Workout'
  | 'WeightTraining'
  | (string & {});

export interface SummaryActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  type: string;
  sport_type: SportType;
  start_date: string; // ISO-8601 UTC
  start_date_local: string; // ISO-8601 local
  timezone: string;
  average_speed: number; // meters/second
  max_speed: number; // meters/second
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  average_cadence?: number;
  has_heartrate: boolean;
  elev_high?: number;
  elev_low?: number;
  achievement_count: number;
  kudos_count: number;
  pr_count: number;
  gear_id: string | null;
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
}

export interface DetailedActivity extends SummaryActivity {
  description: string | null;
  calories: number;
  device_name?: string;
  laps?: Lap[];
  splits_metric?: Split[];
  best_efforts?: unknown[];
  gear?: AthleteGear | null;
}

export interface Lap {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  lap_index: number;
  split: number;
  start_date: string;
  start_date_local: string;
}

export interface Split {
  distance: number;
  elapsed_time: number;
  moving_time: number;
  elevation_difference: number;
  average_speed: number;
  average_heartrate?: number;
  split: number;
  pace_zone: number;
}

export interface ActivityZoneBucket {
  min: number;
  max: number;
  time: number; // seconds spent in this bucket
}

export interface ActivityZone {
  type: 'heartrate' | 'power';
  score?: number;
  sensor_based: boolean;
  points?: number;
  custom_zones?: boolean;
  distribution_buckets: ActivityZoneBucket[];
}

export interface ZoneRange {
  min: number;
  max: number;
}

export interface AthleteZones {
  heart_rate?: {
    custom_zones: boolean;
    zones: ZoneRange[];
  };
  power?: {
    zones: ZoneRange[];
  };
}

export interface ActivityTotal {
  count: number;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  elevation_gain: number; // meters
  achievement_count?: number;
}

export interface AthleteStats {
  biggest_ride_distance: number | null;
  biggest_climb_elevation_gain: number | null;
  recent_run_totals: ActivityTotal;
  recent_ride_totals: ActivityTotal;
  recent_swim_totals: ActivityTotal;
  ytd_run_totals: ActivityTotal;
  ytd_ride_totals: ActivityTotal;
  ytd_swim_totals: ActivityTotal;
  all_run_totals: ActivityTotal;
  all_ride_totals: ActivityTotal;
  all_swim_totals: ActivityTotal;
}

/** OAuth token payload as persisted by this CLI. */
export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  token_type?: string;
  scope?: string;
}
