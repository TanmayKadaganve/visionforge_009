import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { connectDatabase } from '../config/db.js'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

try {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD } = process.env
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PHONE || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, and an ADMIN_PASSWORD of at least 12 characters in backend/.env.')
  }
  await connectDatabase()
  const email = ADMIN_EMAIL.trim().toLowerCase()
  const existing = await User.findOne({ email })
  if (existing) {
    if (existing.role !== 'admin') throw new Error('That email already belongs to a non-admin account. Choose a separate admin email.')
    console.log('Admin account already exists; no changes were made.')
  } else {
    await User.create({ name: ADMIN_NAME.trim(), email, phone: ADMIN_PHONE.trim(), password: ADMIN_PASSWORD, role: 'admin' })
    console.log(`Admin account created for ${email}. Sign in at /admin/login.`)
  }
} catch (error) {
  console.error(`Admin setup failed: ${error.message}`)
  process.exitCode = 1
} finally {
  if (mongoose.connection.readyState) await mongoose.disconnect()
}
