// Minimal type stubs for Express
declare function Router(): any
declare function auth(req: any, res: any, next: any): void
declare function validate(req: any, res: any, next: any): void

const router = Router()

// Standard route with middleware
router.post("/loan/apply", auth, validate, (req: any, res: any) => {
  res.json({ success: true })
})

// Simple GET route
router.get("/loan/:id", auth, (req: any, res: any) => {
  res.json({ id: req.params.id })
})

// Route with inline handler, no middleware
router.get("/loan/status/:id", (req: any, res: any) => {
  res.json({ status: "active" })
})

// DELETE route
router.delete("/loan/:id", auth, (req: any, res: any) => {
  res.sendStatus(204)
})

export default router
