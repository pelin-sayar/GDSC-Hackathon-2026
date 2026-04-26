import { addDoc, collection, serverTimestamp, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'

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
