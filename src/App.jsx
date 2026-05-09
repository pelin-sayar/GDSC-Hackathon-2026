import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { ingredientRules, ingredientSynonyms, regionLabels } from './data/ingredientRules'
import { stores } from './data/storeCatalog'
import { CameraCapture } from './components/CameraCapture'
import { auth } from './firebase'
import { analyzeIngredients, deriveCategory } from './lib/analyzeIngredients'
import { loadEuAdditives } from './lib/foodAdditivesEU'
import { findFdaMatches, loadFoodSubstances } from './lib/foodSubstances'
import { getHealthyRecommendations } from './lib/geminiRecommendations'
import {
  clearGuestScans,
  deleteGuestScan,
  deleteScan,
  getGuestScans,
  getUserScans,
  migrateGuestScansToUser,
  saveGuestScan,
  saveScan,
} from './lib/scanHistory'
import { extractTextFromImage } from './lib/imageOCR'

function App() {
  // UI helpers
  const sectionCardClass = 'rounded-3xl border border-stone-200 p-6 shadow-sm bg-white'
  const storesBadgeClass = 'inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800'
  const inputClass = 'rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100'
  const [store, setStore] = useState('Whole Foods')
  const [category, setCategory] = useState('snacks')
  const [productName, setProductName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [ingredientText, setIngredientText] = useState('')
  const [imagePreview, setImagePreview] = useState('')
  const [pendingImageFile, setPendingImageFile] = useState(null)
  const [savedImageDataUrl, setSavedImageDataUrl] = useState('')
  const [foodSubstances, setFoodSubstances] = useState([])
  const [euAdditives, setEuAdditives] = useState([])
  const [authStatus, setAuthStatus] = useState('checking auth')
  const [saveStatus, setSaveStatus] = useState('')
  const [walmartUrl, setWalmartUrl] = useState('')
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [showCamera, setShowCamera] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [pastScans, setPastScans] = useState([])
  const [pastScansLoading, setPastScansLoading] = useState(false)
  const [pastScansError, setPastScansError] = useState('')
  const [aiRecommendations, setAiRecommendations] = useState([])
  const [aiRecommendationsLoading, setAiRecommendationsLoading] = useState(false)
  const [aiRecommendationsError, setAiRecommendationsError] = useState('')
  const [aiRecommendationsSource, setAiRecommendationsSource] = useState('')
  const [aiRecommendationQueries, setAiRecommendationQueries] = useState([])
  const [aiRecommendationCitations, setAiRecommendationCitations] = useState([])
  const [isMigratingGuestScans, setIsMigratingGuestScans] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPastScan, setSelectedPastScan] = useState(null)
  // Ingredient analysis and recommendations
  const [analysis, setAnalysis] = useState({ matches: [], normalized: [], score: 0 })
  const [inferredCategory, setInferredCategory] = useState(category)
  const [fdaMatches, setFdaMatches] = useState([])

  useEffect(() => {
    let cancelled = false

    loadFoodSubstances()
      .then((records) => {
        if (cancelled) return
        setFoodSubstances(records)
      })
      .catch(() => {
        if (cancelled) return
      })

    loadEuAdditives()
      .then((records) => {
        if (cancelled) return
        setEuAdditives(records)
      })
      .catch(() => {
        if (cancelled) return
        setEuAdditives([])
      })

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (cancelled) return
      setCurrentUser(user)
      setAuthStatus(user ? `Signed in as ${user.email || user.uid}` : 'Not signed in')
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.resolve()
      .then(async () => {
        if (cancelled) return
        setPastScansLoading(true)
        setPastScansError('')

        if (!currentUser) {
          setPastScans(getGuestScans())
          return
        }

        const guestScans = getGuestScans()
        if (guestScans.length) {
          setIsMigratingGuestScans(true)
          await migrateGuestScansToUser({
            userId: currentUser.uid,
            userEmail: currentUser.email || null,
          })
          if (cancelled) return
          clearGuestScans()
          setIsMigratingGuestScans(false)
        }

        const scans = await getUserScans(currentUser.uid)
        if (cancelled) return
        setPastScans(scans)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Error loading past scans:', error.message || error)
        setPastScansError(error.message || 'Failed to load scans')
        setPastScans(currentUser ? [] : getGuestScans())
      })
      .finally(() => {
        if (cancelled) return
        setIsMigratingGuestScans(false)
        setPastScansLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser])

  // (Removed Gemini API recommendations effect; using mock recommendations only)

  const onSubmitAuth = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (error) {
      setAuthError(readableAuthError(error))
    } finally {
      setAuthLoading(false)
    }
  }

  const onSignOut = async () => {
    setAuthError('')
    setAuthLoading(true)

    try {
      await signOut(auth)
      setSaveStatus('')
    } catch (error) {
      setAuthError(readableAuthError(error))
    } finally {
      setAuthLoading(false)
    }
  }

  const onImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setPendingImageFile(file)
    setOcrError('')
    void updateSavedImageDataUrl(file)
    const nextUrl = URL.createObjectURL(file)
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return nextUrl
    })
  }

  const processImageForOCR = async (imageFile) => {
    setOcrLoading(true)
    setOcrError('')

    try {
      const extractedText = await extractTextFromImage(imageFile)
      if (extractedText.trim()) {
        return extractedText.trim()
      } else {
        setOcrError('No text found in image. Please try another photo or enter text manually.')
        return ''
      }
    } catch (error) {
      setOcrError(error.message || 'Please enter text manually.')
      console.error('OCR error:', error)
      return ''
    } finally {
      setOcrLoading(false)
    }
  }

  const updateSavedImageDataUrl = async (file) => {
    try {
      const dataUrl = await loadImageDataUrl(file)
      setSavedImageDataUrl(dataUrl)
    } catch (error) {
      console.error('Failed to prepare saved image:', error)
      setSavedImageDataUrl('')
    }
  }

  const onCameraCapture = async (blob) => {
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setPendingImageFile(file)
    setOcrError('')
    void updateSavedImageDataUrl(file)

    const nextUrl = URL.createObjectURL(blob)
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return nextUrl
    })

    setShowCamera(false)
  }

  const onSearch = async () => {
    setSearchLoading(true)
    setSaveStatus('')
    setAiRecommendationsLoading(true)
    setAiRecommendationsError('')
    setAiRecommendationsSource('')
    setAiRecommendations([])
    setAiRecommendationQueries([])
    setAiRecommendationCitations([])

    try {
      let nextIngredientText = ingredientText.trim()

      if (pendingImageFile) {
        const extractedText = await processImageForOCR(pendingImageFile)
        if (extractedText) {
          nextIngredientText = extractedText
          setIngredientText(extractedText)
          setPendingImageFile(null)
        }
      }

      const analysisResult = analyzeIngredients(
        nextIngredientText,
        ingredientRules,
        ingredientSynonyms,
        foodSubstances,
        euAdditives,
      )
      const nextInferredCategory = deriveCategory(category, nextIngredientText, analysisResult.matches)
      const nextFdaMatches = findFdaMatches(analysisResult.matches, foodSubstances)

      setAnalysis(analysisResult)
      setInferredCategory(nextInferredCategory)
      setFdaMatches(nextFdaMatches)

      const result = await getHealthyRecommendations({
        store,
        productName,
        category,
        ingredientText: nextIngredientText,
        flaggedIngredients: analysisResult.matches.map((item) => item.label),
      })

      setAiRecommendations(result.recommendations)
      setAiRecommendationsSource(result.source)
      setAiRecommendationQueries(result.searchQueries || [])
      setAiRecommendationCitations(result.citations || [])
      await persistScanSnapshot({
        ingredientText: nextIngredientText,
        inferredCategory: nextInferredCategory,
        analysisResult,
        nextFdaMatches,
        recommendationResult: result,
      })
    } catch (error) {
      console.error('Search error:', error)
      setAiRecommendationsError(error.message || 'Failed to get recommendations')
    } finally {
      setAiRecommendationsLoading(false)
      setSearchLoading(false)
    }
  }

  const persistScanSnapshot = async ({
    ingredientText: ingredientTextToSave,
    inferredCategory: categoryToSave,
    analysisResult,
    nextFdaMatches,
    recommendationResult,
  }) => {
    setSaveStatus('Saving scan...')

    const scanPayload = {
      store,
      category: categoryToSave,
      productName,
      brandName,
      ingredientText: ingredientTextToSave,
      flaggedIngredients: analysisResult.matches.map((item) => item.label),
      analysisMatches: analysisResult.matches,
      fdaMatches: nextFdaMatches.map((item) => item.substance),
      riskScore: analysisResult.score,
      recommendations: recommendationResult.recommendations || [],
      recommendationSource: recommendationResult.source || '',
      recommendationQueries: recommendationResult.searchQueries || [],
      recommendationCitations: recommendationResult.citations || [],
      imageDataUrl: savedImageDataUrl,
      walmartUrl,
    }

    try {
      if (currentUser) {
        await saveScan({
          ...scanPayload,
          userId: currentUser.uid,
          userEmail: currentUser.email || null,
        })
        const scans = await getUserScans(currentUser.uid)
        setPastScans(scans)
        setSaveStatus('Search saved to your account')
      } else {
        const savedGuestScan = saveGuestScan(scanPayload)
        setPastScans((prev) => [savedGuestScan, ...prev.filter((scan) => scan.id !== savedGuestScan.id)])
        setSaveStatus('Search saved for this session. Sign in before leaving the page to keep it.')
      }
    } catch (error) {
      console.error('Save error:', error)
      setSaveStatus(`Could not save scan: ${error.message}`)
    }
  }

  const onDeleteScan = async (scanId) => {
    if (!scanId) return
    try {
      if (scanId.startsWith('guest-')) {
        deleteGuestScan(scanId)
      } else {
        await deleteScan(scanId)
      }
      setSelectedPastScan((current) => (current?.id === scanId ? null : current))
      setPastScans((prev) => prev.filter((s) => s.id !== scanId))
    } catch (error) {
      console.error('Failed to delete scan:', error)
      // Optionally show UI error
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div
          className={`${sectionCardClass} overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,210,130,0.32),_transparent_30%),linear-gradient(180deg,rgba(255,251,245,0.95),rgba(244,247,239,0.92))]`}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-amber-700">
            Label Lynx
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-stone-950 md:text-6xl">
            Scan a grocery label, flag risky ingredients, and get a cleaner in-store alternative.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-stone-700 md:text-lg">
            Compare food ingredients with US, EU, and Asian standards, learn why an additive is controversial, and find alternatives in your grocery store.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className={storesBadgeClass}>{authStatus}</span>
          </div>
        </div>

        <div className={`${sectionCardClass} bg-gradient-to-br from-emerald-50 to-lime-50`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-stone-950">Account</h2>
            </div>
            {currentUser ? (
              <button
                className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-200"
                type="button"
                onClick={onSignOut}
                disabled={authLoading}
              >
                Sign out
              </button>
            ) : null}
          </div>

          {currentUser ? (
            <div className="mt-5 rounded-3xl border border-emerald-200 bg-white p-4">
              <p className="text-sm font-medium text-emerald-900">Signed in</p>
              <p className="mt-1 text-sm text-stone-600">{currentUser.email || currentUser.uid}</p>
            </div>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={onSubmitAuth}>
              <div className="flex gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    authMode === 'signin'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-emerald-300 text-stone-700 hover:bg-emerald-50'
                  }`}
                  type="button"
                  onClick={() => setAuthMode('signin')}
                >
                  Sign in
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    authMode === 'signup'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-emerald-300 text-stone-700 hover:bg-emerald-50'
                  }`}
                  type="button"
                  onClick={() => setAuthMode('signup')}
                >
                  Create account
                </button>
              </div>

              <label className="block text-sm font-medium text-stone-800">
                <span className="mb-2 block">Email</span>
                <input
                  className="w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="block text-sm font-medium text-stone-800">
                <span className="mb-2 block">Password</span>
                <input
                  className="w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                />
              </label>

              <button
                className="w-full rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={authLoading || !email.trim() || password.length < 6}
              >
                {authLoading
                  ? 'Working...'
                  : authMode === 'signup'
                    ? 'Create account'
                    : 'Sign in'}
              </button>

              {authError ? <p className="text-sm text-rose-300">{authError}</p> : null}
            </form>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form className={sectionCardClass} onSubmit={(event) => event.preventDefault()}>
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-stone-950">Scan</h2>
            <p className="mt-1 text-sm text-stone-600">
              Use a live photo, or type in ingredients. The app compares flagged ingredients across all supported regions automatically.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-800">
              <span>Grocery store*</span>
              <select className={inputClass} value={store} onChange={(event) => setStore(event.target.value)}>
                {stores.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-800">
              <span>Category*</span>
              <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="snacks">Snacks</option>
                <option value="cereal">Cereal</option>
                <option value="drinks">Drinks</option>
                <option value="bread">Bread</option>
                <option value="candy">Candy</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-stone-800">
              <span>Brand*</span>
              <input className={inputClass} value={brandName} onChange={(event) => setBrandName(event.target.value)} />
            </label>

            <label className="grid gap-2 text-sm font-medium text-stone-800">
              <span>Product name*</span>
              <input className={inputClass} value={productName} onChange={(event) => setProductName(event.target.value)} />
            </label>
          </div>

          <label className="mt-4 grid gap-2 text-sm font-medium text-stone-800">
            <span>Label photo*</span>
            <div className="flex gap-3">
              <input
                className="block flex-1 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-emerald-800"
                type="file"
                accept="image/*"
                onChange={onImageChange}
              />
              <button
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 whitespace-nowrap"
                type="button"
                onClick={() => setShowCamera(true)}
              >
                📷 Take Photo
              </button>
            </div>
          </label>

          <label className="mt-4 grid gap-2 text-sm font-medium text-stone-800">
            <span>Walmart product URL</span>
            <input
              className={inputClass}
              value={walmartUrl}
              onChange={(event) => setWalmartUrl(event.target.value)}
              placeholder="https://www.walmart.com/ip/..."
            />
          </label>

          {imagePreview ? (
            <div className="mt-4 rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <img
                className="max-h-64 w-full rounded-2xl object-cover"
                src={imagePreview}
                alt="Uploaded product label preview"
              />
              {ocrLoading ? (
                <p className="mt-3 text-sm text-amber-600">Extracting text from image...</p>
              ) : ocrError ? (
                <p className="mt-3 text-sm text-rose-600">{ocrError}</p>
              ) : pendingImageFile ? (
                <p className="mt-3 text-sm text-stone-600">Photo ready. Click Search to search.</p>
              ) : (
                <p className="mt-3 text-sm text-emerald-600">✓ Text extracted and loaded below</p>
              )}
            </div>
          ) : null}

          <label className="mt-4 grid gap-2 text-sm font-medium text-stone-800">
            <span>Ingredients text</span>
            <textarea
              className={`${inputClass} min-h-52 resize-y`}
              rows="9"
              value={ingredientText}
              onChange={(event) => setIngredientText(event.target.value)}
              placeholder="type ingredients here..."
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onSearch}
              disabled={searchLoading || aiRecommendationsLoading}
            >
              {searchLoading || aiRecommendationsLoading ? 'Searching...' : 'Search'}
            </button>
              <button
                className="rounded-full bg-stone-200 px-5 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-300"
                type="button"
                onClick={() => {
                  setIngredientText('')
                  setOcrError('')
                  setPendingImageFile(null)
                  setSavedImageDataUrl('')
                }}
              >
                Clear text
              </button>
          </div>
          {saveStatus ? <p className="mt-3 text-sm text-stone-600">{saveStatus}</p> : null}
        </form>

        <div className={`${sectionCardClass} overflow-y-auto`}>
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-stone-950">Analysis</h2>
            <p className="mt-1 text-sm text-stone-600">{productName} from {store}, Risk score 0/100 is no risk, Risk score 100/100 is high risk</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <span className="text-sm text-stone-500">Flagged ingredients</span>
              <strong className="mt-2 block text-3xl font-semibold text-stone-950">{analysis.matches.length}</strong>
            </div>
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <span className="text-sm text-stone-500">Risk score</span>
              <strong className="mt-2 block text-3xl font-semibold text-stone-950">{analysis.score}/100</strong>
            </div>
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <span className="text-sm text-stone-500">Category used</span>
              <strong className="mt-2 block text-3xl font-semibold capitalize text-stone-950">{inferredCategory}</strong>
            </div>
          </div>

          {analysis.matches.length ? (
            <div className="mt-4 grid gap-4">
              {analysis.matches.map((match) => (
                <article className="rounded-3xl border border-stone-200 bg-white p-5" key={match.key}>
                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-950">{match.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{match.reason}</p>
                    </div>
                    <span
                      className={[
                        'inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide',
                        match.severity === 'high' && 'bg-rose-100 text-rose-700',
                        match.severity === 'medium' && 'bg-amber-100 text-amber-700',
                        match.severity === 'low' && 'bg-emerald-100 text-emerald-700',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {match.severity}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {match.regions ? (
                      Object.entries(match.regions).map(([region, status]) => (
                        <div className="rounded-2xl bg-stone-50 p-4" key={region}>
                          <span className="text-xs uppercase tracking-wide text-stone-500">{regionLabels[region]}</span>
                          <strong className="mt-2 block text-sm font-semibold text-stone-900">{status}</strong>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="rounded-2xl bg-stone-50 p-4">
                          <span className="text-xs uppercase tracking-wide text-stone-500">E-code</span>
                          <strong className="mt-2 block text-sm font-semibold text-stone-900">{match.eCode || 'Not listed'}</strong>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-4">
                          <span className="text-xs uppercase tracking-wide text-stone-500">Food category</span>
                          <strong className="mt-2 block text-sm font-semibold text-stone-900">{match.foodCategory || 'Unknown'}</strong>
                        </div>
                        <div className="rounded-2xl bg-stone-50 p-4">
                          <span className="text-xs uppercase tracking-wide text-stone-500">EU restriction</span>
                          <strong className="mt-2 block text-sm font-semibold text-stone-900">{match.restriction || 'Listed'}</strong>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-stone-600">
                    Why it matters: {match.why || match.restrictionComment || match.legislation || 'This additive is present in the selected regulatory dataset.'}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <h3 className="text-lg font-semibold text-stone-950">
                No flagged ingredients found in the current rule set.
              </h3>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-6 text-3xl font-semibold text-stone-950">
          Gemini recommendations for {store}
        </h2>
        <div className={sectionCardClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              {aiRecommendationsSource ? `Source: ${aiRecommendationsSource}` : 'Waiting for ranked results'}
            </p>
            {aiRecommendationsLoading ? (
              <p className="text-sm text-amber-700">Ranking healthier options...</p>
            ) : null}
          </div>

          {aiRecommendationsError ? (
            <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">{aiRecommendationsError}</p>
            </div>
          ) : null}

          {aiRecommendationQueries.length ? (
            <div className="mb-4 rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Search queries</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {aiRecommendationQueries.map((query) => (
                  <span key={query} className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">
                    {query}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {aiRecommendations.length ? (
              aiRecommendations.map((item) => (
                <article
                  className="rounded-3xl border border-stone-200 bg-white p-4"
                  key={`${item.store || store}-${item.brand}-${item.product}`}
                >
                  <h4 className="text-lg font-semibold text-stone-950">{item.product}</h4>
                  <p className="mt-1 text-xs text-stone-600">Brand: {item.brand}</p>
                  <p className="mt-1 text-xs text-stone-600">Store: {item.store || store}</p>
                  <p className="mt-2 text-xs leading-5 text-stone-600">Reason: {item.reason}</p>
                  <p className="mt-2 text-xs leading-5 text-emerald-700">Why healthier: {item.whyHealthier}</p>
                  {item.evidence ? (
                    <p className="mt-2 text-xs text-stone-500">Availability evidence: {item.evidence}</p>
                  ) : null}
                  {item.avoids?.length ? (
                    <p className="mt-2 text-xs text-stone-500">Avoids: {item.avoids.join(', ')}</p>
                  ) : null}
                  {item.comparedTo && (
                    <p className="mt-2 text-xs text-stone-500">Compared to: {item.comparedTo}</p>
                  )}
                  {item.ingredientDiff && item.ingredientDiff.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-stone-700">Ingredient differences:</span>
                      <ul className="ml-4 list-disc text-xs text-stone-700">
                        {item.ingredientDiff.map((diff, i) => (
                          <li key={i}>{diff}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                No recommendations available yet. Add a store, product, or ingredient
                list so Gemini can search for healthier alternatives.
              </p>
            )}
          </div>

          {aiRecommendationCitations.length ? (
            <div className="mt-4 rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sources</p>
              <div className="mt-3 grid gap-2">
                {aiRecommendationCitations.slice(0, 8).map((source) => (
                  <a
                    key={source.uri}
                    className="text-sm text-emerald-700 underline underline-offset-2"
                    href={source.uri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-6 text-3xl font-semibold text-stone-950">
          {currentUser ? 'Past Scans:' : 'Session Scans:'}
        </h2>
        {!currentUser ? (
          <p className="mb-4 text-sm text-stone-600">
            Guest scans last only for this browser session. Create or sign in to an account before
            leaving the page if you want to keep them.
          </p>
        ) : null}
        {pastScansError && (
          <div className={`${sectionCardClass} bg-red-50`}>
            <p className="text-red-700">Error: {pastScansError}</p>
          </div>
        )}
        {pastScansLoading ? (
          <div className={`${sectionCardClass}`}>
            <p className="text-stone-600">
              {isMigratingGuestScans ? 'Saving your guest scans to your account...' : 'Loading your scans...'}
            </p>
          </div>
        ) : pastScans.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastScans.map((scan) => (
              <div
                key={scan.id}
                className={`${sectionCardClass} cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md`}
                onClick={() => setSelectedPastScan(scan)}
              >
                <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-stone-950">{scan.productName}</h3>
                        <p className="text-xs text-stone-600">{scan.brandName}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteScan(scan.id)
                        }}
                        aria-label="Delete scan"
                        title="Delete scan"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-red-600 hover:text-red-800"
                      >
                        <span aria-hidden="true" className="text-xl font-extrabold leading-none">×</span>
                      </button>
                    </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-stone-600">{scan.store}</span>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        scan.riskScore >= 60
                          ? 'bg-red-100 text-red-700'
                          : scan.riskScore >= 30
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                    >
                      Risk: {scan.riskScore}/100
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-stone-600">
                    {scan.ingredientText.substring(0, 80)}...
                  </p>
                  {scan.createdAt ? (
                    <p className="text-xs text-stone-500">
                      {(() => {
                        const date = scan.createdAt?.toDate ? scan.createdAt.toDate() : new Date(scan.createdAt)
                        return date.toLocaleDateString()
                      })()}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`${sectionCardClass}`}>
            <p className="text-stone-600">
              {currentUser ? 'No saved scans yet. Start by scanning a label!' : 'No session scans yet. Start by scanning a label!'}
            </p>
          </div>
        )}
      </section>

      {showCamera && (
        <CameraCapture
          onCapture={onCameraCapture}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {selectedPastScan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-white p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">Past Scan</p>
                <h3 className="mt-2 text-3xl font-semibold text-stone-950">{selectedPastScan.productName || 'Saved scan'}</h3>
                <p className="mt-2 text-sm text-stone-600">
                  {selectedPastScan.brandName || 'Unknown brand'} at {selectedPastScan.store}
                </p>
              </div>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                type="button"
                onClick={() => setSelectedPastScan(null)}
              >
                Close
              </button>
            </div>

            {selectedPastScan.imageDataUrl ? (
              <div className="mt-6 rounded-3xl border border-stone-200 bg-stone-50 p-4">
                <img
                  className="max-h-80 w-full rounded-2xl object-contain"
                  src={selectedPastScan.imageDataUrl}
                  alt="Saved scan preview"
                />
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                <span className="text-sm text-stone-500">Flagged ingredients</span>
                <strong className="mt-2 block text-3xl font-semibold text-stone-950">
                  {selectedPastScan.analysisMatches?.length || 0}
                </strong>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                <span className="text-sm text-stone-500">Risk score</span>
                <strong className="mt-2 block text-3xl font-semibold text-stone-950">
                  {selectedPastScan.riskScore || 0}/100
                </strong>
              </div>
              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                <span className="text-sm text-stone-500">Category</span>
                <strong className="mt-2 block text-3xl font-semibold capitalize text-stone-950">
                  {selectedPastScan.category || 'snacks'}
                </strong>
              </div>
            </div>

            <section className="mt-6">
              <h4 className="text-xl font-semibold text-stone-950">Ingredient analysis</h4>
              {selectedPastScan.analysisMatches?.length ? (
                <div className="mt-4 grid gap-4">
                  {selectedPastScan.analysisMatches.map((match, index) => (
                    <article className="rounded-3xl border border-stone-200 bg-white p-5" key={`${match.key || match.label}-${index}`}>
                      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                        <div>
                          <h5 className="text-lg font-semibold text-stone-950">{match.label}</h5>
                          <p className="mt-1 text-sm leading-6 text-stone-600">{match.reason}</p>
                        </div>
                        <span
                          className={[
                            'inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide',
                            match.severity === 'high' && 'bg-rose-100 text-rose-700',
                            match.severity === 'medium' && 'bg-amber-100 text-amber-700',
                            match.severity === 'low' && 'bg-emerald-100 text-emerald-700',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {match.severity}
                        </span>
                      </div>
                      {match.regions ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          {Object.entries(match.regions).map(([region, status]) => (
                            <div className="rounded-2xl bg-stone-50 p-4" key={region}>
                              <span className="text-xs uppercase tracking-wide text-stone-500">{regionLabels[region]}</span>
                              <strong className="mt-2 block text-sm font-semibold text-stone-900">{status}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-4 text-sm leading-6 text-stone-600">
                        Why it matters: {match.why || match.restrictionComment || match.legislation || 'This ingredient was flagged in the saved scan.'}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-sm text-stone-700">No flagged ingredients were stored for this scan.</p>
                </div>
              )}
            </section>

            <section className="mt-6">
              <h4 className="text-xl font-semibold text-stone-950">Recommended alternatives</h4>
              {selectedPastScan.recommendations?.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {selectedPastScan.recommendations.map((item, index) => (
                    <article
                      className="rounded-3xl border border-stone-200 bg-white p-4"
                      key={`${item.store || selectedPastScan.store}-${item.brand}-${item.product}-${index}`}
                    >
                      <h5 className="text-lg font-semibold text-stone-950">{item.product}</h5>
                      <p className="mt-1 text-xs text-stone-600">Brand: {item.brand}</p>
                      <p className="mt-1 text-xs text-stone-600">Store: {item.store || selectedPastScan.store}</p>
                      <p className="mt-2 text-xs leading-5 text-stone-600">Reason: {item.reason}</p>
                      <p className="mt-2 text-xs leading-5 text-emerald-700">Why healthier: {item.whyHealthier}</p>
                      {item.evidence ? (
                        <p className="mt-2 text-xs text-stone-500">Availability evidence: {item.evidence}</p>
                      ) : null}
                      {item.avoids?.length ? (
                        <p className="mt-2 text-xs text-stone-500">Avoids: {item.avoids.join(', ')}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
                  <p className="text-sm text-stone-700">No recommendations were saved for this scan.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function loadImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function readableAuthError(error) {
  const code = error?.code

  if (code === 'auth/email-already-in-use') return 'That email already has an account.'
  if (code === 'auth/invalid-credential') return 'Incorrect email or password.'
  if (code === 'auth/invalid-email') return 'That email address is invalid.'
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.'
  if (code === 'auth/operation-not-allowed')
    return 'Enable Email/Password auth in Firebase Console.'

  return 'Authentication failed.'
}

export default App
