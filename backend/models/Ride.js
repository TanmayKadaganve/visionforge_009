import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point', required: true },
  coordinates: { type: [Number], required: true, validate: value => value.length === 2 && value.every(Number.isFinite) },
}, { _id: false })

const rideSchema = new mongoose.Schema({
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pickup: {
    label: { type: String, required: true, maxlength: 200 },
    location: { type: pointSchema, required: true },
  },
  destination: {
    label: { type: String, required: true, maxlength: 200 },
    location: { type: pointSchema, required: true },
  },
  routeDistanceKm: { type: Number, required: true, min: 0 },
  vehicleType: { type: String, enum: ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric'] },
  estimatedDurationMinutes: { type: Number, required: true, min: 1 },
  pickupDistanceKm: { type: Number, required: true, min: 0 },
  pickupEtaMinutes: { type: Number, required: true, min: 1 },
  estimatedFare: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', enum: ['INR'] },
  fareFormula: {
    vehicleType: { type: String, enum: ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric'] },
    baseFare: { type: Number, required: true },
    ratePerKm: { type: Number, required: true },
  },
  status: { type: String, enum: ['Requested', 'Accepted', 'Arriving', 'Ongoing', 'Completed', 'Rejected', 'Cancelled'], default: 'Requested', index: true },
  statusHistory: [{ status: { type: String, required: true }, at: { type: Date, default: Date.now } }],
  assignmentHistory: [{ driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, score: Number, reason: String, assignedAt: { type: Date, default: Date.now }, outcome: { type: String, enum: ['pending', 'accepted', 'rejected', 'timeout', 'reassigned'] } }],
  acceptedAt: Date,
  pickupDeadlineAt: Date,
  completedAt: Date,
}, { timestamps: true, versionKey: false })

export default mongoose.model('Ride', rideSchema)
