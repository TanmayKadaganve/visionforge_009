import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import User from '../models/User.js'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const testUser = {
  name: 'RideFlow Test Passenger',
  email: 'rideflow.passenger@example.com',
  phone: '+919000000001',
  password: 'RideFlowTest123!',
  role: 'passenger',
}

try {
  await connectDatabase()
  let user = await User.findOne({ email: testUser.email })
  if (user) {
    Object.assign(user, testUser)
    await user.save()
  } else {
    const phoneInUse = await User.exists({ phone: testUser.phone })
    if (phoneInUse) throw new Error('The test phone number is already assigned to another account.')
    user = await User.create(testUser)
  }
  console.log('Test passenger is ready:', JSON.stringify(user.toSafeObject(), null, 2))
  console.log(`Test login password: ${testUser.password}`)
} catch (error) {
  console.error(`Could not seed the test passenger (${error.name}). Start MongoDB and verify backend/.env.`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
