declare function Router(): any

const router = Router()

router.get("/health", (req: any, res: any) => {
  res.json({ ok: true })
})

export default router
