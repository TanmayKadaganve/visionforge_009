import mongoose from 'mongoose'

const candidateSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rank: { type: Number, required: true },
  score: { type: Number, required: true },
  distanceKm: Number,
  pickupEtaMinutes: Number,
  workload: Number,
  idleMinutes: Number,
  acceptanceRate: Number,
  selected: { type: Boolean, default: false },
  reason: { type: String, maxlength: 500 },
}, { _id: false })

const allocationLogSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  vehicleType: String,
  candidates: { type: [candidateSchema], default: [] },
  selectedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  outcome: { type: String, enum: ['assigned', 'reassigned', 'unassigned'], default: 'assigned' },
}, { timestamps: true, versionKey: false })

export default mongoose.model('AllocationLog', allocationLogSchema)
