import { addDoc, collection, serverTimestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

const GUEST_SCANS_KEY = 'label-lynx-guest-scans'

export async function saveScan(scan) {
  return addDoc(collection(db, 'scans'), {
    ...scan,
    createdAt: serverTimestamp(),
  })
}

export async function getUserScans(userId) {
  try {
    const q = query(
      collection(db, 'scans'),
      where('userId', '==', userId)
    )
    const snapshot = await getDocs(q)
    console.log(`Found ${snapshot.docs.length} scans for user ${userId}`)
    const scans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    // Sort by createdAt descending (newest first) client-side
    return scans.sort((a, b) => {
      const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt)
      const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt)
      return timeB - timeA
    })
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

export async function deleteScan(scanId) {
  try {
    return await deleteDoc(doc(db, 'scans', scanId))
  } catch (error) {
    console.error('deleteScan error:', error)
    throw error
  }
}

export function getGuestScans() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.sessionStorage.getItem(GUEST_SCANS_KEY)
    const scans = raw ? JSON.parse(raw) : []
    return Array.isArray(scans) ? scans : []
  } catch (error) {
    console.error('Failed to load guest scans:', error)
    return []
  }
}

export function saveGuestScan(scan) {
  const scans = getGuestScans()
  const nextScan = {
    ...scan,
    id: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isGuest: true,
    createdAt: new Date().toISOString(),
  }

  const nextScans = [nextScan, ...scans]
  persistGuestScans(nextScans)
  return nextScan
}

export function deleteGuestScan(scanId) {
  const nextScans = getGuestScans().filter((scan) => scan.id !== scanId)
  persistGuestScans(nextScans)
}

export function clearGuestScans() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(GUEST_SCANS_KEY)
}

export async function migrateGuestScansToUser({ userId, userEmail }) {
  const guestScans = getGuestScans()
  if (!guestScans.length) return []

  const saved = []
  for (const scan of guestScans) {
    const payload = {
      userId,
      userEmail: userEmail || null,
      store: scan.store,
      category: scan.category,
      productName: scan.productName,
      brandName: scan.brandName,
      ingredientText: scan.ingredientText,
      flaggedIngredients: scan.flaggedIngredients || [],
      analysisMatches: scan.analysisMatches || [],
      fdaMatches: scan.fdaMatches || [],
      riskScore: scan.riskScore || 0,
      recommendations: scan.recommendations || [],
      recommendationSource: scan.recommendationSource || '',
      recommendationQueries: scan.recommendationQueries || [],
      recommendationCitations: scan.recommendationCitations || [],
      imageDataUrl: scan.imageDataUrl || '',
      walmartUrl: scan.walmartUrl || '',
    }

    await saveScan(payload)
    saved.push(payload)
  }

  clearGuestScans()
  return saved
}

function persistGuestScans(scans) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(GUEST_SCANS_KEY, JSON.stringify(scans))
}
