import mongoose from 'mongoose'

const rideEventSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true, index: true },
  eventType: { type: String, required: true, index: true },
  status: { type: String },
  message: { type: String, required: true, maxlength: 500 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, enum: ['system', 'admin', 'passenger', 'driver'] },
  details: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true, versionKey: false })

rideEventSchema.index({ ride: 1, createdAt: 1 })
export default mongoose.model('RideEvent', rideEventSchema)
