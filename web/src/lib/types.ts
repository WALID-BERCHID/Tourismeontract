export type Chain = "evm" | "solana" | "eos";

export interface Wallet {
  chain: Chain;
  address: string;
}

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
  work: string;
  languages: string[];
  isSuperhost: boolean;
  emailVerified: boolean;
  joinedAt: string;
  hostReviewCount: number;
  hostRating: number | null;
  guestReviewCount: number;
  listingCount: number;
  wallets: Wallet[];
  // private fields (own profile only)
  email?: string | null;
  phone?: string | null;
  isAdmin?: boolean;
  emailNotifications?: boolean;
  preferredCurrency?: string;
  hasPassword?: boolean;
}

export interface ListingChain {
  chain: Chain;
  network: string;
  chainListingId: string;
  contract: string;
  name?: string;
}

export interface Listing {
  id: number;
  slug: string;
  title: string;
  propertyType: string;
  roomType: "entire" | "private" | "shared";
  category: string;
  city: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  guests: number;
  bedrooms: number;
  beds: number;
  baths: number;
  photos: string[];
  priceUsd: number;
  cleaningFeeUsd: number;
  instantBook: boolean;
  status: "draft" | "published" | "unlisted";
  rating: number | null;
  reviewCount: number;
  chains: ListingChain[];
  hostId: number;
  isNew: boolean;
  wishlisted: boolean;
  totalUsd?: number | null;
  // full
  description?: string;
  neighborhood?: string;
  amenities?: string[];
  houseRules?: string[];
  cancellationPolicy?: "flexible" | "moderate" | "strict";
  minNights?: number;
  maxNights?: number;
  checkInTime?: string;
  checkOutTime?: string;
  ratingDetails?: Record<string, number | null>;
  address?: string | null;
  createdAt?: string;
}

export interface Review {
  id: number;
  rating: number;
  comment: string;
  createdAt: string;
  txHash?: string | null;
  target?: string;
  listingTitle?: string;
  author: { id: number; name: string; avatarUrl: string | null; location?: string; joinedAt?: string };
}

export interface Quote {
  nightly: number;
  nights: number;
  base: number;
  cleaningFee: number;
  subtotal: number;
  serviceFee: number;
  total: number;
}

export type BookingStatus =
  | "pending_host"
  | "confirmed"
  | "declined"
  | "cancelled_by_guest"
  | "cancelled_by_host"
  | "completed"
  | "disputed"
  | "resolved";

export interface Booking {
  id: number;
  code: string;
  status: BookingStatus;
  chain: Chain;
  network: string;
  networkName: string;
  chainBookingId: string | null;
  txHash: string | null;
  txUrl: string | null;
  payerAddress: string | null;
  currency: string;
  amountNative: string;
  checkIn: string;
  checkOut: string;
  checkInDay: number;
  checkOutDay: number;
  guests: number;
  nights: number;
  subtotalUsd: number;
  feeUsd: number;
  totalUsd: number;
  hostPayoutUsd: number;
  message: string;
  createdAt: string;
  reviewed: boolean;
  guestReviewed: boolean;
  conversationId: number | null;
  bucket?: "upcoming" | "current" | "past" | "cancelled";
  listing: {
    id: number;
    title: string;
    city: string;
    country: string;
    photo: string | null;
    cancellationPolicy: "flexible" | "moderate" | "strict";
    checkInTime: string;
    checkOutTime: string;
    address: string | null;
    lat: number;
    lng: number;
  };
  guest: User;
  host: User;
}

export interface Network {
  id: string;
  chain: Chain;
  chainId?: number | string;
  name: string;
  rpc: string;
  nativeSymbol: string;
  explorer?: string;
  escrow?: string;
  usdc?: string;
  programId?: string;
  contract?: string;
  testnet: boolean;
  tokens: { symbol: string; address?: string; decimals: number; contract?: string }[];
}

export interface Meta {
  platformName: string;
  categories: { id: string; label: string; icon: string }[];
  amenities: { id: string; label: string; group: string }[];
  propertyTypes: string[];
  fees: { guestFeeBps: number; hostFeeBps: number };
  networks: Network[];
  emailEnabled: boolean;
}

export interface Conversation {
  id: number;
  role: "host" | "guest";
  other: User;
  listing: { id: number; title: string; city: string; photo: string | null };
  booking: { id: number; code: string; status: BookingStatus; check_in: number; check_out: number } | null;
  lastMessage: { body: string; kind: string; createdAt: string; mine: boolean } | null;
  unread: number;
  updatedAt: string;
}

export interface Message {
  id: number;
  body: string;
  kind: "text" | "system";
  senderId: number | null;
  mine: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
