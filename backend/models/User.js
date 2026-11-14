import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^\+?[1-9]\d{7,14}$/
const bookingVehicleTypes = ['Bike', 'Scooter', 'Auto', 'Mini', 'Sedan', 'SUV', 'Premium', 'Electric']
const vehicleTypes = [...bookingVehicleTypes, 'Hatchback', 'MUV', 'Van', 'Other']
const vehicleSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: vehicleTypes },
  make: { type: String, required: true, trim: true, maxlength: 80 },
  model: { type: String, required: true, trim: true, maxlength: 80 },
  color: { type: String, required: true, trim: true, maxlength: 40 },
  manufacturingYear: { type: Number, required: true, min: 1950, max: new Date().getFullYear() },
  seatingCapacity: { type: Number, required: true, min: 1, max: 20 },
  acType: { type: String, required: true, enum: ['AC', 'Non-AC'] },
  registrationNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
}, { _id: false })
const driverDetailsSchema = new mongoose.Schema({
  licenseNumber: { type: String, required: true, trim: true, uppercase: true, minlength: 5, maxlength: 30 },
  vehicle: { type: vehicleSchema, required: true },
  availability: { type: String, enum: ['offline', 'available', 'requested', 'busy'], default: 'offline' },
  availableSince: { type: Date },
  idleDurationsMinutes: { type: [Number], default: [] },
  assignmentCount: { type: Number, default: 0 },
  acceptedCount: { type: Number, default: 0 },
  rejectedCount: { type: Number, default: 0 },
  profilePhotoUrl: { type: String, trim: true, maxlength: 500 },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  location: { type: new mongoose.Schema({
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true, default: undefined, validate: value => value.length === 2 && value.every(Number.isFinite) },
  }, { _id: false }), default: undefined },
  locationUpdatedAt: { type: Date },
}, { _id: false })
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: emailPattern },
  googleId: { type: String, unique: true, sparse: true, select: false },
  phone: { type: String, required: true, unique: true, trim: true, match: phonePattern },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'passenger', 'driver'], required: true, index: true },
  driverDetails: { type: driverDetailsSchema, required: function driverDetailsRequired() { return this.role === 'driver' } },
}, { timestamps: true, versionKey: false })
userSchema.index({ 'driverDetails.licenseNumber': 1 }, { unique: true, sparse: true })
userSchema.index({ 'driverDetails.vehicle.registrationNumber': 1 }, { unique: true, partialFilterExpression: { 'driverDetails.vehicle.registrationNumber': { $type: 'string' } } })
userSchema.index({ 'driverDetails.location': '2dsphere' })
userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12)
})
userSchema.methods.comparePassword = function comparePassword(candidate) { return bcrypt.compare(candidate, this.password) }
userSchema.methods.toSafeObject = function toSafeObject() { return { id: this.id, name: this.name, email: this.email, phone: this.phone, role: this.role, createdAt: this.createdAt } }
export default mongoose.model('User', userSchema)
