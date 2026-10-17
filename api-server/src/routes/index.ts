import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import menuRouter from "./menu";
import superAdminRouter from "./superAdmin";

import posRouter from "./pos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(posRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(menuRouter);
router.use(superAdminRouter);

export default router;
