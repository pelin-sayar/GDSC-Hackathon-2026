import { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { ingredientRules, ingredientSynonyms, regionLabels } from './data/ingredientRules'
import { storeCatalog, stores } from './data/storeCatalog'
import { auth } from './firebase'
import { analyzeIngredients, deriveCategory } from './lib/analyzeIngredients'
import { findFdaMatches, loadFoodSubstances } from './lib/foodSubstances'
import { getHealthyRecommendations } from './lib/geminiRecommendations'
import { saveScan, getUserScans, deleteScan } from './lib/scanHistory'
import { extractTextFromImage } from './lib/imageOCR'
import { CameraCapture } from './components/CameraCapture'

const sampleLabel = `Ingredients: Enriched wheat flour, sugar, palm oil, butylated hydroxyanisole (BHA), potassium bromate, red 40, yellow 5, natural flavors, sodium benzoate.`

const storesBadgeClass =
  'rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900'
const sectionCardClass =
  'rounded-[28px] border border-stone-200 bg-white/80 p-5 shadow-[0_20px_70px_rgba(20,35,25,0.08)] backdrop-blur md:p-7'
const inputClass =
  'w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100'

function App() {
  const [store, setStore] = useState('Whole Foods')
  const [category, setCategory] = useState('snacks')
  const [productName, setProductName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [ingredientText, setIngredientText] = useState(sampleLabel)
  const [imagePreview, setImagePreview] = useState('')
  const [foodSubstances, setFoodSubstances] = useState([])
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

  const analysis = useMemo(
    () => analyzeIngredients(ingredientText, ingredientRules, ingredientSynonyms),
    [ingredientText],
  )
  const inferredCategory = deriveCategory(category, ingredientText, analysis.matches)
  const fdaMatches = useMemo(
    () => findFdaMatches(analysis.matches, foodSubstances),
    [analysis.matches, foodSubstances],
  )
  const storeCandidates = useMemo(
    () => storeCatalog.filter((item) => item.store === store),
    [store],
  )

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
    if (!currentUser) {
      return
    }

    let cancelled = false

    Promise.resolve()
      .then(() => {
        if (cancelled) return
        setPastScansLoading(true)
        setPastScansError('')
        return getUserScans(currentUser.uid)
      })
      .then((scans) => {
        if (cancelled) return
        console.log('Loaded scans:', scans)
        setPastScans(scans)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Error loading past scans:', error.message || error)
        setPastScansError(error.message || 'Failed to load scans')
        setPastScans([])
      })
      .finally(() => {
        if (cancelled) return
        setPastScansLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!storeCandidates.length) {
        setAiRecommendations([])
        setAiRecommendationsSource('')
        return
      }

      setAiRecommendationsLoading(true)
      setAiRecommendationsError('')

      try {
        const result = await getHealthyRecommendations({
          store,
          productName: productName.trim(),
          category: inferredCategory,
          ingredientText,
          flaggedIngredients: analysis.matches.map((item) => item.label),
          candidates: storeCandidates,
        })

        if (cancelled) return
        setAiRecommendations(result.recommendations)
        setAiRecommendationsSource(result.source)
      } catch (error) {
        if (cancelled) return
        setAiRecommendations([])
        setAiRecommendationsError(error.message || 'Could not load Gemini recommendations')
        setAiRecommendationsSource('')
      } finally {
        if (!cancelled) {
          setAiRecommendationsLoading(false)
        }
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    store,
    productName,
    inferredCategory,
    ingredientText,
    analysis.matches,
    storeCandidates,
  ])

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

    const nextUrl = URL.createObjectURL(file)
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return nextUrl
    })
    
    // Auto-extract text from uploaded image
    processImageForOCR(file)
  }

  const processImageForOCR = async (imageFile) => {
    if (!currentUser) {
      setOcrError('Sign in before scanning labels')
      return
    }

    setOcrLoading(true)
    setOcrError('')

    try {
      const extractedText = await extractTextFromImage(imageFile)
      if (extractedText.trim()) {
        setIngredientText(extractedText)
      } else {
        setOcrError('No text found in image. Please try another photo or enter text manually.')
      }
    } catch (error) {
      setOcrError(`OCR error: ${error.message}. Please enter text manually.`)
      console.error('OCR error:', error)
    } finally {
      setOcrLoading(false)
    }
  }

  const onCameraCapture = async (blob) => {
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
    
    const nextUrl = URL.createObjectURL(blob)
    setImagePreview((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return nextUrl
    })
    
    setShowCamera(false)
    await processImageForOCR(file)
  }

  const onSaveScan = async () => {
    if (!currentUser) {
      setSaveStatus('Sign in before saving scans')
      return
    }

    setSaveStatus('Saving scan...')

    try {
      await saveScan({
        userId: currentUser.uid,
        userEmail: currentUser.email || null,
        store,
        category: inferredCategory,
        productName,
        brandName,
        ingredientText,
        flaggedIngredients: analysis.matches.map((item) => item.label),
        fdaMatches: fdaMatches.map((item) => item.substance),
        riskScore: analysis.score,
        walmartUrl,
      })
      setSaveStatus('Saved Successfully')
    } catch (error) {
      console.error('Save error:', error)
      setSaveStatus(`Could not save scan: ${error.message}`)
    }
  }

  const onDeleteScan = async (scanId) => {
    if (!scanId) return
    try {
      await deleteScan(scanId)
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
              Use a live photo, or type in ingredients.
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
              className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onSaveScan}
              disabled={!currentUser}
            >
              Save scan
            </button>
            <button
              className="rounded-full bg-stone-200 px-5 py-3 text-sm font-medium text-stone-800 transition hover:bg-stone-300"
              type="button"
              onClick={() => setIngredientText('')}
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
                    {Object.entries(match.regions).map(([region, status]) => (
                      <div className="rounded-2xl bg-stone-50 p-4" key={region}>
                        <span className="text-xs uppercase tracking-wide text-stone-500">{regionLabels[region]}</span>
                        <strong className="mt-2 block text-sm font-semibold text-stone-900">{status}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-stone-600">Why it matters: {match.why}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
              <h3 className="text-lg font-semibold text-stone-950">
                No flagged ingredients found in the current rule set.
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                The analyzer only knows about ingredients loaded into the prototype dataset. That
                is where your Open Food Facts, IngrediCheck, and EAFUS ingestion jobs would expand
                coverage.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-6 text-3xl font-semibold text-stone-950">
          Gemini-ranked recommendations for {store}
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

          <div className="grid gap-3 md:grid-cols-2">
            {aiRecommendations.length ? (
              aiRecommendations.map((item) => (
                <article
                  className="rounded-3xl border border-stone-200 bg-white p-4"
                  key={`${item.store}-${item.brand}-${item.product}`}
                >
                  <h4 className="text-sm font-semibold text-stone-950">{item.product}</h4>
                  <p className="mt-1 text-xs text-stone-600">{item.brand}</p>
                  <p className="mt-2 text-xs leading-5 text-stone-600">
                    {item.reason || item.pitch}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-emerald-700">
                    Why healthier: {item.whyHealthier || 'Lower-risk ingredient profile'}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                No recommendations available yet. Add a store, product, and ingredient list to rank
                better options.
              </p>
            )}
          </div>
        </div>
      </section>

      {currentUser && (
        <section className="mt-8">
          <h2 className="mb-6 text-3xl font-semibold text-stone-950">Past Scans:</h2>
          {pastScansError && (
            <div className={`${sectionCardClass} bg-red-50`}>
              <p className="text-red-700">Error: {pastScansError}</p>
            </div>
          )}
          {pastScansLoading ? (
            <div className={`${sectionCardClass}`}>
              <p className="text-stone-600">Loading your scans...</p>
            </div>
          ) : pastScans.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastScans.map((scan) => (
                <div
                  key={scan.id}
                  className={`${sectionCardClass}`}
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
                    {scan.createdAt && (
                      <p className="text-xs text-stone-500">
                        {(() => {
                          const date = scan.createdAt?.toDate ? scan.createdAt.toDate() : new Date(scan.createdAt)
                          return date.toLocaleDateString()
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`${sectionCardClass}`}>
              <p className="text-stone-600">No saved scans yet. Start by scanning a label!</p>
            </div>
          )}
        </section>
      )}

      {showCamera && (
        <CameraCapture
          onCapture={onCameraCapture}
          onCancel={() => setShowCamera(false)}
        />
      )}
    </main>
  )
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
