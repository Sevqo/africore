import { workRules, saveWorkRules } from './work-automation';
import {
  createWorkChannel,
  listWorkChannelMessages,
  listWorkChannels,
  postWorkChannelMessage,
} from './work-discussions';
import {
  setProjectTemplate,
  workTemplates,
  workSalesSources,
  projectFromSales,
} from './work-templates';
import { taxCodes, saveTaxCode, previewTaxEntry, prepareTaxEntry } from './accounting-tax';
import { accountingAging } from './accounting-aging';
import {
  actOnPeriodClose,
  createFiscalYear,
  fiscalYears,
  lockDates,
  periodCloseDetail,
  saveLockDates,
} from './accounting-close';
import { importOpening, openingRegister } from './accounting-opening';
import { accountingStatements } from './accounting-statements';
import {
  actOnDeferral,
  deferralDetail,
  deferralReport,
  deferralSources,
  listDeferralModels,
  listDeferrals,
  saveDeferral,
  saveDeferralModel,
} from './deferrals';
import {
  actOnAsset,
  assetDetail,
  assetSources,
  listAssetModels,
  listAssets,
  saveAssetModel,
  saveFixedAsset,
} from './fixed-assets';
import {
  bankLine,
  bankStatement,
  createBankJournal,
  decideBankMatch,
  importBankStatement,
  listBankJournals,
  listBankStatements,
  proposeBankMatch,
  unmatchedBankLines,
} from './bank-reconciliation';
import { requestProjectReview } from './work-reviews';
import { prepareOnboardingProject } from './people-onboarding';
import { organizationChart, peopleReport } from './people-reports';
import {
  purchaseList,
  procurementApprovals,
  purchaseDetails,
  savePurchase,
  purchaseDecision,
  receivePurchase,
  supplierBalance,
  recordSupplierPayment,
  amendPurchaseOrder,
  procurementReport,
} from './procurement';
import {
  compareTenderBids,
  createBlanketOrder,
  createThreeWayMatch,
  decideThreeWayMatch,
  evaluateThreeWay,
  listBlanketOrders,
  listThreeWayMatches,
  updateBlanketOrder,
} from './procurement-phase3';
import {
  calculatePosLoyalty,
  createCrmScheduledActivity,
  createLeaveAllocation,
  createPayrollRun,
  createPosCashCount,
  createPosLoyaltyProgram,
  createWorkBillingSummary,
  createWorkMilestone,
  decidePayrollRun,
  evaluateCrmScore,
  evaluateCrmWeightedForecast,
  evaluatePosCashCount,
  evaluateWorkBilling,
  listCrmScheduledActivities,
  listLeaveAllocations,
  listPayrollRuns,
  listPosCashCounts,
  listPosLoyaltyPrograms,
  listWorkBillingSummaries,
  listWorkMilestones,
  previewPayroll,
  updateCrmScheduledActivity,
  updateWorkMilestone,
} from './odoo-phases4-7';
import {
  calculateComboPrice,
  calculateSplitBill,
  createDropship,
  createKdsTicket,
  createPosFloor,
  createPosTable,
  createSelfOrderSession,
  createVendorTier,
  evaluateAgreementCalloff,
  evaluateVendorScorecard,
  listDropships,
  listKdsTickets,
  listPosFloors,
  listVendorTiers,
  selectBestVendorTier,
  updateKdsTicketStatus,
} from './procurement-pos-parity';
import {
  addWishlistItem,
  createAnalyticsSnapshot,
  createSignEnvelope,
  evaluateAbandonedCarts,
  evaluateHospitalityRevpar,
  evaluateMarketingFunnel,
  evaluateMrpOee,
  evaluatePeopleOvertime,
  evaluateRentalPricing,
  evaluateSubscriptionsNrr,
  evaluateSupportSla,
  evaluateTreasuryRunway,
  evaluateWorkProfitability,
  gradeLearningQuiz,
  listAnalyticsSnapshots,
  listSignEnvelopes,
  listWishlists,
  signEnvelope,
} from './suite-parity';
import {
  createPutawayRule,
  createReorderingRule,
  createStockPackage,
  evaluateBackorderSplit,
  listPutawayRules,
  listReorderingRules,
  listStockPackages,
  planPickingWaves,
  processBarcodeScan,
  resolvePutawayLocation,
  runReplenishment,
} from './inventory-parity';
import {
  computeCrmRecurringRollup,
  computeCrmWinLoss,
  createCrmEnrichment,
  createCrmLostReason,
  createCrmQuota,
  createCrmRoutingRule,
  evaluateCrmLeadRoute,
  evaluateCrmQuotas,
  listCrmEnrichments,
  listCrmLostReasons,
  listCrmQuotas,
  listCrmRoutingRules,
} from './crm-parity';
import {
  computeCashFlowStatement,
  createAnalyticAccount,
  createBatchPayment,
  createBudget,
  createDebitNote,
  createFollowupLevel,
  evaluateBudget,
  evaluateFollowups,
  listAnalyticAccounts,
  listBatchPayments,
  listBudgets,
  listDebitNotes,
  listFollowupLevels,
  listFxRevaluations,
  runFxRevaluation,
} from './accounting-parity';
import {
  createFleetVehicle,
  createLogisticsShipment,
  createMaintenanceRequest,
  createMarketingCampaign,
  createMrpBom,
  createMrpOrder,
  createSubscriptionContract,
  createSubscriptionPlan,
  createSupportTicket,
  listFleetVehicles,
  listLogisticsShipments,
  listMaintenanceRequests,
  listMarketingCampaigns,
  listMrpBoms,
  listMrpOrders,
  listSubscriptionContracts,
  listSubscriptionPlans,
  listSupportTickets,
  previewMrpBomCost,
  previewSubscriptionProration,
  subscriptionMrrReport,
  supportSlaReport,
  updateFleetVehicle,
  updateLogisticsShipment,
  updateMaintenanceRequest,
  updateMarketingCampaign,
  updateMrpOrder,
  updateSubscriptionContract,
  updateSupportTicket,
} from './odoo-phases8-10';
import {
  billPropertyLease,
  billSubscriptionContract,
  captureMarketingLead,
  checkoutHospitalityReservation,
  completeConnectedSale,
  completeMrpOrderWithStock,
  createFieldDispatch,
  createHospitalityReservation,
  createHubConnector,
  createHubPipeline,
  createLearningArticle,
  createLearningCourse,
  createLearningEnrollment,
  createPropertyLease,
  createPropertyUnit,
  createStudioApp,
  createStudioRecord,
  createSupportKbArticle,
  escalateSupportTicket,
  hubTopology,
  listFieldDispatches,
  listHospitalityReservations,
  listHubConnectors,
  listHubEvents,
  listHubPipelines,
  listLearningArticles,
  listLearningCourses,
  listLearningEnrollments,
  listMrpQualityChecks,
  listPropertyLeases,
  listPropertyUnits,
  listStudioApps,
  listStudioRecords,
  listSupportKbArticles,
  recordLogisticsPod,
  runHubPipeline,
  submitLearningAssessment,
} from './apps-17-26';
import {
  applySalesPromo,
  calculateSalesShipping,
  checkSalesWarnings,
  createCommissionPlan,
  createSalesPromo,
  createSalesWarning,
  createShippingMethod,
  evaluateSalesCommission,
  evaluateSalesInvoicingPolicy,
  expandSalesVariantMatrix,
  listCommissionPlans,
  listQuoteSignatures,
  listSalesPromos,
  listSalesWarnings,
  listShippingMethods,
  signSalesQuote,
} from './sales-parity';
import {
  createDocumentRequest,
  documentRequestAssignees,
  documentRequests,
  submitRequestedDocument,
  cancelDocumentRequest,
} from './document-requests';
import { requestDocumentReview, documentReviewers } from './document-reviews';
import { linkDocument, sourceDocuments, documentSourceOptions } from './document-links';
import {
  documents,
  documentDetails,
  createDocument,
  editDocument,
  setDocumentPolicy,
  uploadDocumentVersion,
  setDocumentState,
  copyDocument,
  documentVersions,
  documentContent,
  starDocument,
} from './documents';
import {
  peopleConfiguration,
  savePeopleConfiguration,
  departments,
  saveDepartment,
  employeeDirectory,
  employeeDetails,
  saveEmployee,
  removeEmployee,
  employeeHistory,
  compensationRecords,
  recordCompensation,
} from './people-profiles';
import { syncWorkspaceMembersToEmployees } from './people-sync';
import {
  leaveTypes,
  saveLeaveType,
  leaveBalances,
  previewLeave,
  submitLeave,
  leaveRequests,
  adjustLeave,
  cancelLeave,
} from './people-leave';
import { checkIn, checkOut, attendanceRecords, correctAttendance } from './people-attendance';
import {
  peoplePositions,
  savePeoplePosition,
  peopleSkills,
  savePeopleSkill,
  employeePrivateProfile,
  saveEmployeePrivateProfile,
  employeeResumeEntries,
  saveEmployeeResumeEntry,
  employeeSkillRecords,
  saveEmployeeSkillRecord,
  employeeCertifications,
  saveEmployeeCertification,
  peopleLeaveCalendar,
  peopleAttendanceAnalysis,
  recruitmentOpenings,
  saveRecruitmentOpening,
  recruitmentCandidates,
  saveRecruitmentCandidate,
  recruitmentApplications,
  saveRecruitmentApplication,
  hireRecruitmentCandidate,
  peopleGoals,
  savePeopleGoal,
  updateOwnGoalProgress,
  peopleAppraisals,
  savePeopleAppraisal,
  submitAppraisalSelfAssessment,
  peopleLifecyclePlans,
  savePeopleLifecyclePlan,
  peopleLifecycleCases,
  startPeopleLifecycleCase,
  updatePeopleLifecycleTask,
  completePeopleLifecycleCase,
  peopleExpansionReport,
} from './people-expansion';
import {
  calendarAvailability,
  calendarAppointmentTypes,
  createCalendarAppointmentType,
  updateCalendarAppointmentType,
  bookCalendarAppointment,
  calendarEventHistory,
  getCalendarSettings,
  cancelCalendarEvent,
  cancelCalendarOccurrence,
  calendarEvents,
  createCalendarEvent,
  editCalendarEvent,
  deleteWebsitePage,
  editCalendarOccurrence,
  getWebsiteIdentity,
  publishWebsitePage,
  restoreWebsitePublication,
  respondCalendarInvite,
  saveCalendarSettings,
  saveWebsitePage,
  saveWebsiteIdentity,
  unpublishWebsitePage,
  websitePublicationHistory,
  websitePages,
} from '../apps/phase3';
import { Router } from 'express';
import { prepareAccountingSource } from './accounting-sources';
import { accountingSourceList } from './accounting-source-list';
import { z } from 'zod';
import {
  calendarAppointmentRequestHistory,
  createPublicCalendarLink,
  listCalendarAppointmentRequests,
  reviewCalendarAppointmentRequest,
  revokePublicCalendarLink,
} from '../apps/calendar-appointments';
import { route, access } from '../platform/auth';
import {
  myWork,
  respondWorkMeeting,
  workTarget,
  workProjects,
  workProject,
  createProject,
  editProject,
  saveTask,
  moveTask,
  addWorkMessage,
  workHistory,
} from './work';
import {
  createWorkTimesheet,
  discardWorkTimer,
  editWorkTimesheet,
  listWorkTimesheets,
  reviewWorkTimesheet,
  startWorkTimer,
  stopWorkTimer,
  submitWorkTimesheet,
  workProgressReport,
} from './work-time';
import { generateRecurringTask } from './work-recurrence';
import { projectStatusUpdates, publishProjectUpdate } from './work-updates';
import { workTaskReport, workTimesheetReport } from './work-reporting';
import { applyWorkSchedule, previewWorkSchedule } from './work-scheduling';
import {
  accountingConfiguration,
  setupAccounting,
  saveAccount,
  saveJournal,
  createPeriod,
  setPeriodState,
  accountingEntries,
  accountingItems,
  accountingEntry,
  saveJournalEntry,
  requestJournalReview,
  postJournalEntry,
  reverseJournalEntry,
  accountingReport,
} from './accounting';
export const erp = Router();
const key = (req: any) => z.string().min(8).max(200).parse(req.headers['idempotency-key']);
erp.get(
  '/organizations/:org/accounting/sources',
  route(async (req, res) => res.json(await accountingSourceList(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/accounting/sources',
  route(async (req, res) =>
    res
      .status(201)
      .json(await prepareAccountingSource(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/configuration',
  route(async (req, res) => res.json(await accountingConfiguration(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/setup',
  route(async (req, res) =>
    res.json(await setupAccounting(await access(req, 'admin'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/accounting/accounts',
  route(async (req, res) =>
    res.status(201).json(await saveAccount(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/accounts/:id',
  route(async (req, res) =>
    res.json(
      await saveAccount(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/journals',
  route(async (req, res) =>
    res.status(201).json(await saveJournal(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/journals/:id',
  route(async (req, res) =>
    res.json(
      await saveJournal(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/periods',
  route(async (req, res) =>
    res.status(201).json(await createPeriod(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/periods/:id/state',
  route(async (req, res) =>
    res.json(
      await setPeriodState(await access(req, 'admin'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/accounting/entries',
  route(async (req, res) => res.json(await accountingEntries(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/items',
  route(async (req, res) => res.json(await accountingItems(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/fiscal-years',
  route(async (req, res) => res.json(await fiscalYears(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/fiscal-years',
  route(async (req, res) =>
    res.status(201).json(await createFiscalYear(await access(req, 'admin'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/lock-dates',
  route(async (req, res) => res.json(await lockDates(await access(req)))),
);
erp.put(
  '/organizations/:org/accounting/lock-dates',
  route(async (req, res) =>
    res.json(await saveLockDates(await access(req, 'admin'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/periods/:id/close',
  route(async (req, res) =>
    res.json(await periodCloseDetail(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/accounting/periods/:id/close',
  route(async (req, res) =>
    res.json(
      await actOnPeriodClose(await access(req, 'admin'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/accounting/opening-balances',
  route(async (req, res) => res.json(await openingRegister(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/opening-balances/import',
  route(async (req, res) =>
    res.status(201).json(await importOpening(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/statements',
  route(async (req, res) => res.json(await accountingStatements(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/entries/:id',
  route(async (req, res) =>
    res.json(await accountingEntry(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/accounting/entries',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveJournalEntry(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/entries/:id',
  route(async (req, res) =>
    res.json(
      await saveJournalEntry(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/entries/:id/review',
  route(async (req, res) =>
    res.json(
      await requestJournalReview(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/entries/:id/post',
  route(async (req, res) =>
    res.json(
      await postJournalEntry(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/entries/:id/reverse',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await reverseJournalEntry(
          await access(req, 'finance'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/accounting/report',
  route(async (req, res) => res.json(await accountingReport(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/work/my-work',
  route(async (req, res) => res.json(await myWork(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/work/timesheets',
  route(async (req, res) => res.json(await listWorkTimesheets(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/work/timesheets',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createWorkTimesheet(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/work/timesheets/:entry',
  route(async (req, res) =>
    res.json(
      await editWorkTimesheet(
        await access(req, 'operations'),
        String(req.params.entry),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/timesheets/:entry/submit',
  route(async (req, res) =>
    res.json(
      await submitWorkTimesheet(
        await access(req, 'operations'),
        String(req.params.entry),
        req.body?.expected_version,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/timesheets/:entry/review',
  route(async (req, res) =>
    res.json(
      await reviewWorkTimesheet(
        await access(req, 'operations'),
        String(req.params.entry),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/timers',
  route(async (req, res) =>
    res.status(201).json(await startWorkTimer(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/work/timers/:timer/stop',
  route(async (req, res) =>
    res.json(
      await stopWorkTimer(await access(req, 'operations'), String(req.params.timer), key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/timers/:timer/discard',
  route(async (req, res) =>
    res.json(
      await discardWorkTimer(await access(req, 'operations'), String(req.params.timer), key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id/reports/progress',
  route(async (req, res) =>
    res.json(await workProgressReport(await access(req), String(req.params.id), req.query)),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id/reports/tasks',
  route(async (req, res) =>
    res.json(await workTaskReport(await access(req), String(req.params.id), req.query)),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id/reports/timesheets',
  route(async (req, res) =>
    res.json(await workTimesheetReport(await access(req), String(req.params.id), req.query)),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/schedule/preview',
  route(async (req, res) =>
    res.json(
      await previewWorkSchedule(await access(req, 'operations'), String(req.params.id), req.body),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/schedule/apply',
  route(async (req, res) =>
    res.json(
      await applyWorkSchedule(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id/updates',
  route(async (req, res) =>
    res.json(
      await projectStatusUpdates(
        await access(req),
        String(req.params.id),
        z.coerce.number().int().min(0).max(100000).default(0).parse(req.query.offset),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/updates',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await publishProjectUpdate(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/tasks/:task/recurrence/generate',
  route(async (req, res) =>
    res.json(
      await generateRecurringTask(
        await access(req, 'operations'),
        String(req.params.id),
        String(req.params.task),
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/work/target/:id',
  route(async (req, res) => res.json(await workTarget(await access(req), String(req.params.id)))),
);
erp.get(
  '/organizations/:org/work/projects',
  route(async (req, res) => res.json(await workProjects(await access(req)))),
);
erp.post(
  '/organizations/:org/work/projects',
  route(async (req, res) =>
    res.status(201).json(await createProject(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id',
  route(async (req, res) =>
    res.json(
      await workProject(
        await access(req),
        String(req.params.id),
        z.coerce.number().int().min(0).max(100000).default(0).parse(req.query.messages_offset),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/work/projects/:id',
  route(async (req, res) =>
    res.json(
      await editProject(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/tasks',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await saveTask(
          await access(req, 'operations'),
          String(req.params.id),
          null,
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.put(
  '/organizations/:org/work/projects/:id/tasks/:task',
  route(async (req, res) =>
    res.json(
      await saveTask(
        await access(req, 'operations'),
        String(req.params.id),
        String(req.params.task),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/move',
  route(async (req, res) =>
    res.json(
      await moveTask(await access(req, 'operations'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/projects/:id/messages',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await addWorkMessage(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.post(
  '/organizations/:org/work/meetings/:id/respond',
  route(async (req, res) =>
    res.json(
      await respondWorkMeeting(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/work/channels',
  route(async (req, res) => res.json(await listWorkChannels(await access(req)))),
);
erp.post(
  '/organizations/:org/work/channels',
  route(async (req, res) =>
    res.status(201).json(await createWorkChannel(await access(req, 'operations'), req.body)),
  ),
);
erp.get(
  '/organizations/:org/work/channels/:channelId/messages',
  route(async (req, res) =>
    res.json(await listWorkChannelMessages(await access(req), String(req.params.channelId))),
  ),
);
erp.post(
  '/organizations/:org/work/channels/:channelId/messages',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await postWorkChannelMessage(
          await access(req),
          String(req.params.channelId),
          req.body,
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/work/projects/:id/history/:resource',
  route(async (req, res) =>
    res.json(
      await workHistory(
        await access(req),
        String(req.params.id),
        String(req.params.resource),
        req.query,
      ),
    ),
  ),
);

erp.get(
  '/organizations/:org/people/org-chart',
  route(async (req, res) => res.json(await organizationChart(await access(req)))),
);
erp.get(
  '/organizations/:org/people/report',
  route(async (req, res) => res.json(await peopleReport(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/people/configuration',
  route(async (req, res) => res.json(await peopleConfiguration(await access(req)))),
);
erp.put(
  '/organizations/:org/people/configuration',
  route(async (req, res) =>
    res.json(await savePeopleConfiguration(await access(req), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/departments',
  route(async (req, res) => res.json(await departments(await access(req)))),
);
erp.post(
  '/organizations/:org/people/departments',
  route(async (req, res) =>
    res.json(await saveDepartment(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/departments/:id',
  route(async (req, res) =>
    res.json(await saveDepartment(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/employees',
  route(async (req, res) => res.json(await employeeDirectory(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/employees',
  route(async (req, res) =>
    res.json(await saveEmployee(await access(req), null, req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/sync-team',
  route(async (req, res) =>
    res.json(await syncWorkspaceMembersToEmployees(await access(req))),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id',
  route(async (req, res) =>
    res.json(await employeeDetails(await access(req), String(req.params.id))),
  ),
);
erp.put(
  '/organizations/:org/people/employees/:id',
  route(async (req, res) =>
    res.json(await saveEmployee(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/remove',
  route(async (req, res) =>
    res.json(await removeEmployee(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/history',
  route(async (req, res) =>
    res.json(await employeeHistory(await access(req), String(req.params.id), req.query)),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/compensation',
  route(async (req, res) =>
    res.json(await compensationRecords(await access(req), String(req.params.id), req.query)),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/compensation',
  route(async (req, res) =>
    res.json(
      await recordCompensation(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/leave-types',
  route(async (req, res) => res.json(await leaveTypes(await access(req)))),
);
erp.post(
  '/organizations/:org/people/leave-types',
  route(async (req, res) =>
    res.json(await saveLeaveType(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/leave-types/:id',
  route(async (req, res) =>
    res.json(await saveLeaveType(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/leave-balances',
  route(async (req, res) =>
    res.json(await leaveBalances(await access(req), String(req.params.id), req.query)),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/leave-preview',
  route(async (req, res) =>
    res.json(await previewLeave(await access(req), String(req.params.id), req.body)),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/leave',
  route(async (req, res) =>
    res.json(await submitLeave(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/leave-adjustments',
  route(async (req, res) =>
    res.json(await adjustLeave(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/leave',
  route(async (req, res) => res.json(await leaveRequests(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/leave/:id/cancel',
  route(async (req, res) =>
    res.json(await cancelLeave(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/attendance',
  route(async (req, res) => res.json(await attendanceRecords(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/employees/:id/check-in',
  route(async (req, res) =>
    res.json(await checkIn(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/check-out',
  route(async (req, res) =>
    res.json(await checkOut(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/attendance/:id/correct',
  route(async (req, res) =>
    res.json(await correctAttendance(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/positions',
  route(async (req, res) => res.json(await peoplePositions(await access(req)))),
);
erp.post(
  '/organizations/:org/people/positions',
  route(async (req, res) =>
    res.json(await savePeoplePosition(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/positions/:id',
  route(async (req, res) =>
    res.json(
      await savePeoplePosition(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/skills',
  route(async (req, res) => res.json(await peopleSkills(await access(req)))),
);
erp.post(
  '/organizations/:org/people/skills',
  route(async (req, res) =>
    res.json(await savePeopleSkill(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/skills/:id',
  route(async (req, res) =>
    res.json(await savePeopleSkill(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/private-profile',
  route(async (req, res) =>
    res.json(await employeePrivateProfile(await access(req), String(req.params.id))),
  ),
);
erp.put(
  '/organizations/:org/people/employees/:id/private-profile',
  route(async (req, res) =>
    res.json(
      await saveEmployeePrivateProfile(
        await access(req),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/resume',
  route(async (req, res) =>
    res.json(await employeeResumeEntries(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/resume',
  route(async (req, res) =>
    res.json(
      await saveEmployeeResumeEntry(
        await access(req),
        String(req.params.id),
        null,
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/people/employees/:id/resume/:entry',
  route(async (req, res) =>
    res.json(
      await saveEmployeeResumeEntry(
        await access(req),
        String(req.params.id),
        String(req.params.entry),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/skills',
  route(async (req, res) =>
    res.json(await employeeSkillRecords(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/skills',
  route(async (req, res) =>
    res.json(
      await saveEmployeeSkillRecord(
        await access(req),
        String(req.params.id),
        null,
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/people/employees/:id/skills/:skill',
  route(async (req, res) =>
    res.json(
      await saveEmployeeSkillRecord(
        await access(req),
        String(req.params.id),
        String(req.params.skill),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/employees/:id/certifications',
  route(async (req, res) =>
    res.json(await employeeCertifications(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/people/employees/:id/certifications',
  route(async (req, res) =>
    res.json(
      await saveEmployeeCertification(
        await access(req),
        String(req.params.id),
        null,
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/people/employees/:id/certifications/:certification',
  route(async (req, res) =>
    res.json(
      await saveEmployeeCertification(
        await access(req),
        String(req.params.id),
        String(req.params.certification),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/leave-calendar',
  route(async (req, res) => res.json(await peopleLeaveCalendar(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/people/attendance/analysis',
  route(async (req, res) => res.json(await peopleAttendanceAnalysis(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/people/recruitment/openings',
  route(async (req, res) => res.json(await recruitmentOpenings(await access(req)))),
);
erp.post(
  '/organizations/:org/people/recruitment/openings',
  route(async (req, res) =>
    res.json(await saveRecruitmentOpening(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/recruitment/openings/:id',
  route(async (req, res) =>
    res.json(
      await saveRecruitmentOpening(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/recruitment/candidates',
  route(async (req, res) => res.json(await recruitmentCandidates(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/recruitment/candidates',
  route(async (req, res) =>
    res.json(await saveRecruitmentCandidate(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/recruitment/candidates/:id',
  route(async (req, res) =>
    res.json(
      await saveRecruitmentCandidate(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/recruitment/applications',
  route(async (req, res) => res.json(await recruitmentApplications(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/recruitment/applications',
  route(async (req, res) =>
    res.json(await saveRecruitmentApplication(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/recruitment/applications/:id',
  route(async (req, res) =>
    res.json(
      await saveRecruitmentApplication(
        await access(req),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/people/recruitment/applications/:id/hire',
  route(async (req, res) =>
    res.json(
      await hireRecruitmentCandidate(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/goals',
  route(async (req, res) => res.json(await peopleGoals(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/goals',
  route(async (req, res) =>
    res.json(await savePeopleGoal(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/goals/:id',
  route(async (req, res) =>
    res.json(await savePeopleGoal(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/people/goals/:id/progress',
  route(async (req, res) =>
    res.json(
      await updateOwnGoalProgress(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/appraisals',
  route(async (req, res) => res.json(await peopleAppraisals(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/appraisals',
  route(async (req, res) =>
    res.json(await savePeopleAppraisal(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/appraisals/:id',
  route(async (req, res) =>
    res.json(
      await savePeopleAppraisal(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/people/appraisals/:id/self-assessment',
  route(async (req, res) =>
    res.json(
      await submitAppraisalSelfAssessment(
        await access(req),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/lifecycle/plans',
  route(async (req, res) => res.json(await peopleLifecyclePlans(await access(req)))),
);
erp.post(
  '/organizations/:org/people/lifecycle/plans',
  route(async (req, res) =>
    res.json(await savePeopleLifecyclePlan(await access(req), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/lifecycle/plans/:id',
  route(async (req, res) =>
    res.json(
      await savePeopleLifecyclePlan(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/lifecycle/cases',
  route(async (req, res) => res.json(await peopleLifecycleCases(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/people/lifecycle/cases',
  route(async (req, res) =>
    res.json(await startPeopleLifecycleCase(await access(req), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/people/lifecycle/cases/:id/tasks',
  route(async (req, res) =>
    res.json(
      await updatePeopleLifecycleTask(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/people/lifecycle/cases/:id/complete',
  route(async (req, res) =>
    res.json(
      await completePeopleLifecycleCase(
        await access(req),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/report/expansion',
  route(async (req, res) => res.json(await peopleExpansionReport(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/documents',
  route(async (req, res) => res.json(await documents(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/documents',
  route(async (req, res) => res.json(await createDocument(await access(req), req.body, key(req)))),
);
erp.get(
  '/organizations/:org/documents/:id',
  route(async (req, res) =>
    res.json(await documentDetails(await access(req), String(req.params.id), true)),
  ),
);
erp.put(
  '/organizations/:org/documents/:id',
  route(async (req, res) =>
    res.json(await editDocument(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/documents/:id/policy',
  route(async (req, res) =>
    res.json(await setDocumentPolicy(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/documents/:id/versions',
  route(async (req, res) =>
    res.json(
      await uploadDocumentVersion(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/documents/:id/versions',
  route(async (req, res) =>
    res.json(await documentVersions(await access(req), String(req.params.id), req.query)),
  ),
);
erp.get(
  '/organizations/:org/documents/:id/content',
  route(async (req, res) =>
    res.json(
      await documentContent(
        await access(req),
        String(req.params.id),
        z.string().uuid().optional().parse(req.query.version_id),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/documents/:id/copy',
  route(async (req, res) =>
    res.json(await copyDocument(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/documents/:id/state',
  route(async (req, res) =>
    res.json(await setDocumentState(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/documents/:id/star',
  route(async (req, res) =>
    res.json(
      await starDocument(
        await access(req),
        String(req.params.id),
        z.object({ starred: z.boolean() }).strict().parse(req.body).starred,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/documents/:id/links',
  route(async (req, res) =>
    res.json(await linkDocument(await access(req), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/document-attachments',
  route(async (req, res) => res.json(await sourceDocuments(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/document-source-options',
  route(async (req, res) => res.json(await documentSourceOptions(await access(req), req.query))),
);

erp.post(
  '/organizations/:org/documents/:id/review',
  route(async (req, res) =>
    res.json(
      await requestDocumentReview(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/documents/:id/reviewers',
  route(async (req, res) =>
    res.json(await documentReviewers(await access(req), String(req.params.id))),
  ),
);

erp.get(
  '/organizations/:org/document-request-assignees',
  route(async (req, res) => res.json(await documentRequestAssignees(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/document-requests',
  route(async (req, res) => res.json(await documentRequests(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/document-requests',
  route(async (req, res) =>
    res.json(await createDocumentRequest(await access(req), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/document-requests/:id/submit',
  route(async (req, res) =>
    res.json(
      await submitRequestedDocument(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/document-requests/:id/cancel',
  route(async (req, res) =>
    res.json(
      await cancelDocumentRequest(await access(req), String(req.params.id), req.body, key(req)),
    ),
  ),
);

const purchaseType = (value: unknown) =>
  z
    .enum([
      'supplier',
      'request',
      'rfq',
      'order',
      'receipt',
      'bill',
      'payment',
      'credit',
      'price',
      'agreement',
      'template',
    ])
    .parse(value);
erp.get(
  '/organizations/:org/procurement',
  route(async (req, res) => res.json(await purchaseList(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/procurement',
  route(async (req, res) =>
    res
      .status(201)
      .json(await savePurchase(await access(req, 'operations'), null, req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/procurement-report',
  route(async (req, res) => res.json(await procurementReport(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/procurement-approvals',
  route(async (req, res) => res.json(await procurementApprovals(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/procurement/three-way-match/evaluate',
  route(async (req, res) => res.json(await evaluateThreeWay(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/procurement/three-way-match',
  route(async (req, res) => res.json(await listThreeWayMatches(await access(req)))),
);
erp.post(
  '/organizations/:org/procurement/three-way-match',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createThreeWayMatch(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/procurement/three-way-match/:id',
  route(async (req, res) =>
    res.json(
      await decideThreeWayMatch(
        await access(req, 'admin'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/procurement/blanket-orders',
  route(async (req, res) => res.json(await listBlanketOrders(await access(req)))),
);
erp.post(
  '/organizations/:org/procurement/blanket-orders',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createBlanketOrder(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/procurement/blanket-orders/:id',
  route(async (req, res) =>
    res.json(
      await updateBlanketOrder(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/procurement/tenders/compare',
  route(async (req, res) => res.json(await compareTenderBids(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/procurement/orders/:id/amend',
  route(async (req, res) =>
    res.json(
      await amendPurchaseOrder(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/procurement/:type/:id',
  route(async (req, res) =>
    res.json(
      await purchaseDetails(
        await access(req),
        String(req.params.id),
        purchaseType(req.params.type),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/procurement/:type/:id',
  route(async (req, res) => {
    const type = purchaseType(req.params.type);
    if (req.body?.record?.type !== type)
      throw Object.assign(new Error('Purchase type mismatch'), { status: 400 });
    res.json(
      await savePurchase(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    );
  }),
);
erp.post(
  '/organizations/:org/procurement/:type/:id/decision',
  route(async (req, res) =>
    res.json(
      await purchaseDecision(
        await access(req, 'operations'),
        String(req.params.id),
        purchaseType(req.params.type),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/procurement/orders/:id/receive',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await receivePurchase(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/procurement/bills/:id/balance',
  route(async (req, res) =>
    res.json(await supplierBalance(await access(req, 'finance'), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/procurement/bills/:id/payment',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await recordSupplierPayment(
          await access(req, 'finance'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);

erp.post(
  '/organizations/:org/people/employees/:id/onboarding-project',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await prepareOnboardingProject(
          await access(req),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);

erp.post(
  '/organizations/:org/work/projects/:id/review',
  route(async (req, res) =>
    res.json(
      await requestProjectReview(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

erp.get(
  '/organizations/:org/accounting/assets',
  route(async (req, res) => res.json(await listAssets(await access(req)))),
);
erp.get(
  '/organizations/:org/accounting/asset-sources',
  route(async (req, res) => res.json(await assetSources(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/assets/:id',
  route(async (req, res) => res.json(await assetDetail(await access(req), String(req.params.id)))),
);
erp.post(
  '/organizations/:org/accounting/assets',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveFixedAsset(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/assets/:id',
  route(async (req, res) =>
    res.json(
      await saveFixedAsset(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/assets/:id/action',
  route(async (req, res) =>
    res.json(
      await actOnAsset(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/accounting/asset-models',
  route(async (req, res) => res.json(await listAssetModels(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/asset-models',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveAssetModel(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/asset-models/:id',
  route(async (req, res) =>
    res.json(
      await saveAssetModel(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);

erp.get(
  '/organizations/:org/accounting/deferrals',
  route(async (req, res) => res.json(await listDeferrals(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/deferral-sources',
  route(async (req, res) => res.json(await deferralSources(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/deferral-report',
  route(async (req, res) => res.json(await deferralReport(await access(req), req.query))),
);
erp.get(
  '/organizations/:org/accounting/deferrals/:id',
  route(async (req, res) =>
    res.json(await deferralDetail(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/accounting/deferrals',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveDeferral(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/deferrals/:id',
  route(async (req, res) =>
    res.json(
      await saveDeferral(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/deferrals/:id/action',
  route(async (req, res) =>
    res.json(
      await actOnDeferral(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.get(
  '/organizations/:org/accounting/deferral-models',
  route(async (req, res) => res.json(await listDeferralModels(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/deferral-models',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveDeferralModel(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/deferral-models/:id',
  route(async (req, res) =>
    res.json(
      await saveDeferralModel(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

erp.get(
  '/organizations/:org/accounting/aging',
  route(async (req, res) => res.json(await accountingAging(await access(req), req.query))),
);

erp.get(
  '/organizations/:org/accounting/bank-journals',
  route(async (req, res) => res.json(await listBankJournals(await access(req)))),
);
erp.get(
  '/organizations/:org/accounting/bank-journals/:id/unmatched',
  route(async (req, res) =>
    res.json(await unmatchedBankLines(await access(req), String(req.params.id), req.query)),
  ),
);
erp.post(
  '/organizations/:org/accounting/bank-journals',
  route(async (req, res) =>
    res.status(201).json(await createBankJournal(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/bank-statements',
  route(async (req, res) => res.json(await listBankStatements(await access(req), req.query))),
);
erp.post(
  '/organizations/:org/accounting/bank-statements',
  route(async (req, res) =>
    res
      .status(201)
      .json(await importBankStatement(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/bank-statements/:id',
  route(async (req, res) =>
    res.json(await bankStatement(await access(req), String(req.params.id), req.query)),
  ),
);
erp.get(
  '/organizations/:org/accounting/bank-lines/:id',
  route(async (req, res) =>
    res.json(await bankLine(await access(req), String(req.params.id), req.query)),
  ),
);
erp.post(
  '/organizations/:org/accounting/bank-lines/:id/matches',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await proposeBankMatch(
          await access(req, 'finance'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.post(
  '/organizations/:org/accounting/bank-matches/:id/decision',
  route(async (req, res) =>
    res.json(
      await decideBankMatch(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

erp.get(
  '/organizations/:org/accounting/tax-codes',
  route(async (req, res) => res.json(await taxCodes(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/tax-codes',
  route(async (req, res) =>
    res.status(201).json(await saveTaxCode(await access(req, 'finance'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/accounting/tax-codes/:id',
  route(async (req, res) =>
    res.json(
      await saveTaxCode(await access(req, 'finance'), String(req.params.id), req.body, key(req)),
    ),
  ),
);
erp.post(
  '/organizations/:org/accounting/tax-preview',
  route(async (req, res) =>
    res.json(await previewTaxEntry(await access(req, 'finance'), req.body)),
  ),
);
erp.post(
  '/organizations/:org/accounting/tax-entries',
  route(async (req, res) =>
    res.status(201).json(await prepareTaxEntry(await access(req, 'finance'), req.body, key(req))),
  ),
);

erp.get(
  '/organizations/:org/work/templates',
  route(async (req, res) => res.json(await workTemplates(await access(req)))),
);
erp.get(
  '/organizations/:org/work/sales-sources',
  route(async (req, res) => res.json(await workSalesSources(await access(req)))),
);
erp.put(
  '/organizations/:org/work/projects/:id/template',
  route(async (req, res) =>
    res.json(
      await setProjectTemplate(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/from-sales',
  route(async (req, res) =>
    res
      .status(201)
      .json(await projectFromSales(await access(req, 'operations'), req.body, key(req))),
  ),
);

erp.get(
  '/organizations/:org/work/projects/:id/workflows',
  route(async (req, res) =>
    res.json(await workRules(await access(req), String(req.params.id), req.query)),
  ),
);
erp.put(
  '/organizations/:org/work/projects/:id/workflows',
  route(async (req, res) =>
    res.json(
      await saveWorkRules(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

erp.get(
  '/organizations/:org/calendar/events',
  route(async (req, res) =>
    res.json(
      await calendarEvents(
        await access(req),
        typeof req.query.from === 'string' ? req.query.from : undefined,
        typeof req.query.to === 'string' ? req.query.to : undefined,
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/calendar/events/:id/history',
  route(async (req, res) =>
    res.json(await calendarEventHistory(await access(req), String(req.params.id))),
  ),
);
erp.get(
  '/organizations/:org/calendar/settings',
  route(async (req, res) => res.json(await getCalendarSettings(await access(req)))),
);
erp.put(
  '/organizations/:org/calendar/settings',
  route(async (req, res) =>
    res.json(await saveCalendarSettings(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/calendar/availability',
  route(async (req, res) => {
    const from = z.string().datetime({ offset: true }).parse(req.query.from);
    const to = z.string().datetime({ offset: true }).parse(req.query.to);
    const members = z
      .string()
      .max(3000)
      .default('')
      .parse(req.query.members)
      .split(',')
      .filter(Boolean);
    res.json(await calendarAvailability(await access(req), from, to, members));
  }),
);
erp.post(
  '/organizations/:org/calendar/events',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCalendarEvent(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/calendar/events/:id',
  route(async (req, res) =>
    res.json(
      await editCalendarEvent(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.put(
  '/organizations/:org/calendar/events/:id/occurrences/:occurrence',
  route(async (req, res) =>
    res.json(
      await editCalendarOccurrence(
        await access(req, 'operations'),
        String(req.params.id),
        decodeURIComponent(String(req.params.occurrence)),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/calendar/events/:id/occurrences/:occurrence/cancel',
  route(async (req, res) =>
    res.json(
      await cancelCalendarOccurrence(
        await access(req, 'operations'),
        String(req.params.id),
        decodeURIComponent(String(req.params.occurrence)),
        req.body?.expected_version,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/calendar/events/:id/respond',
  route(async (req, res) =>
    res.json(
      await respondCalendarInvite(
        await access(req, 'read'),
        String(req.params.id),
        req.body?.response,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/calendar/events/:id/cancel',
  route(async (req, res) =>
    res.json(
      await cancelCalendarEvent(
        await access(req, 'operations'),
        String(req.params.id),
        req.body?.expected_version,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/calendar/appointment-types',
  route(async (req, res) => res.json(await calendarAppointmentTypes(await access(req)))),
);
erp.post(
  '/organizations/:org/calendar/appointment-types',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await createCalendarAppointmentType(await access(req, 'operations'), req.body, key(req)),
      ),
  ),
);
erp.put(
  '/organizations/:org/calendar/appointment-types/:id',
  route(async (req, res) =>
    res.json(
      await updateCalendarAppointmentType(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/calendar/appointment-types/:id/bookings',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await bookCalendarAppointment(await access(req), String(req.params.id), req.body, key(req)),
      ),
  ),
);
erp.post(
  '/organizations/:org/calendar/appointment-types/:id/public-link',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await createPublicCalendarLink(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
        ),
      ),
  ),
);
erp.delete(
  '/organizations/:org/calendar/appointment-types/:id/public-link',
  route(async (req, res) =>
    res.json(
      await revokePublicCalendarLink(await access(req, 'operations'), String(req.params.id)),
    ),
  ),
);
erp.get(
  '/organizations/:org/calendar/appointment-types/:id/requests',
  route(async (req, res) =>
    res.json(
      await listCalendarAppointmentRequests(await access(req, 'admin'), String(req.params.id)),
    ),
  ),
);
erp.post(
  '/organizations/:org/calendar/appointment-types/:id/requests/:booking/review',
  route(async (req, res) =>
    res.json(
      await reviewCalendarAppointmentRequest(
        await access(req, 'operations'),
        String(req.params.id),
        String(req.params.booking),
        req.body,
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/calendar/appointment-types/:id/requests/:booking/history',
  route(async (req, res) =>
    res.json(
      await calendarAppointmentRequestHistory(
        await access(req, 'admin'),
        String(req.params.id),
        String(req.params.booking),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/website/settings',
  route(async (req, res) => res.json(await getWebsiteIdentity(await access(req)))),
);
erp.put(
  '/organizations/:org/website/settings',
  route(async (req, res) =>
    res.json(await saveWebsiteIdentity(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/website/pages/:id/publication-history',
  route(async (req, res) =>
    res.json(await websitePublicationHistory(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/website/pages/:id/publication-history/:version/restore',
  route(async (req, res) =>
    res.json(
      await restoreWebsitePublication(
        await access(req, 'operations'),
        String(req.params.id),
        Number(req.params.version),
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/website/pages',
  route(async (req, res) => res.json(await websitePages(await access(req)))),
);
erp.post(
  '/organizations/:org/website/pages',
  route(async (req, res) =>
    res
      .status(201)
      .json(await saveWebsitePage(await access(req, 'operations'), null, req.body, key(req))),
  ),
);
erp.put(
  '/organizations/:org/website/pages/:id',
  route(async (req, res) =>
    res.json(
      await saveWebsitePage(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.delete(
  '/organizations/:org/website/pages/:id',
  route(async (req, res) =>
    res.json(
      await deleteWebsitePage(
        await access(req, 'operations'),
        String(req.params.id),
        Number(req.body?.expected_version ?? req.query?.expected_version),
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/website/pages/:id/publish',
  route(async (req, res) =>
    res.json(
      await publishWebsitePage(
        await access(req, 'operations'),
        String(req.params.id),
        req.body?.expected_version,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/website/pages/:id/unpublish',
  route(async (req, res) =>
    res.json(
      await unpublishWebsitePage(
        await access(req, 'operations'),
        String(req.params.id),
        req.body?.expected_version,
        key(req),
      ),
    ),
  ),
);

// Phase 4: POS Cash Drawer Control & Loyalty Programs
erp.post(
  '/organizations/:org/pos/cash-count/evaluate',
  route(async (req, res) =>
    res.json(await evaluatePosCashCount(await access(req, 'operations'), req.body)),
  ),
);
erp.get(
  '/organizations/:org/pos/cash-counts',
  route(async (req, res) => res.json(await listPosCashCounts(await access(req)))),
);
erp.post(
  '/organizations/:org/pos/cash-counts',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPosCashCount(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/pos/loyalty-programs',
  route(async (req, res) => res.json(await listPosLoyaltyPrograms(await access(req)))),
);
erp.post(
  '/organizations/:org/pos/loyalty-programs',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPosLoyaltyProgram(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/pos/loyalty/calculate',
  route(async (req, res) =>
    res.json(await calculatePosLoyalty(await access(req, 'operations'), req.body)),
  ),
);

// Phase 5: CRM Predictive Lead Scoring, Weighted Forecast & Scheduled Activities
erp.post(
  '/organizations/:org/crm/scoring/evaluate',
  route(async (req, res) => res.json(await evaluateCrmScore(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/crm/weighted-forecast',
  route(async (req, res) =>
    res.json(await evaluateCrmWeightedForecast(await access(req), req.body)),
  ),
);
erp.get(
  '/organizations/:org/crm/scheduled-activities',
  route(async (req, res) => res.json(await listCrmScheduledActivities(await access(req)))),
);
erp.post(
  '/organizations/:org/crm/scheduled-activities',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCrmScheduledActivity(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/crm/scheduled-activities/:id',
  route(async (req, res) =>
    res.json(
      await updateCrmScheduledActivity(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// Phase 6: Work Milestones & Billable Timesheet Invoicing
erp.get(
  '/organizations/:org/work/milestones',
  route(async (req, res) => res.json(await listWorkMilestones(await access(req)))),
);
erp.post(
  '/organizations/:org/work/milestones',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createWorkMilestone(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/work/milestones/:id',
  route(async (req, res) =>
    res.json(
      await updateWorkMilestone(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/work/billing/evaluate',
  route(async (req, res) => res.json(await evaluateWorkBilling(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/work/billing-summaries',
  route(async (req, res) => res.json(await listWorkBillingSummaries(await access(req)))),
);
erp.post(
  '/organizations/:org/work/billing-summaries',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createWorkBillingSummary(await access(req, 'operations'), req.body, key(req))),
  ),
);

// Phase 7: People Payroll Runs & Leave Allocations
erp.post(
  '/organizations/:org/people/payroll/preview',
  route(async (req, res) => res.json(await previewPayroll(await access(req, 'finance'), req.body))),
);
erp.get(
  '/organizations/:org/people/payroll-runs',
  route(async (req, res) => res.json(await listPayrollRuns(await access(req)))),
);
erp.post(
  '/organizations/:org/people/payroll-runs',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPayrollRun(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/people/payroll-runs/:id',
  route(async (req, res) =>
    res.json(
      await decidePayrollRun(
        await access(req, 'finance'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/people/leave-allocations',
  route(async (req, res) => res.json(await listLeaveAllocations(await access(req)))),
);
erp.post(
  '/organizations/:org/people/leave-allocations',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLeaveAllocation(await access(req, 'operations'), req.body, key(req))),
  ),
);

// Phase 8: Subscriptions & Recurring Billing
erp.get(
  '/organizations/:org/subscriptions/plans',
  route(async (req, res) => res.json(await listSubscriptionPlans(await access(req)))),
);
erp.post(
  '/organizations/:org/subscriptions/plans',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSubscriptionPlan(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/subscriptions/contracts',
  route(async (req, res) => res.json(await listSubscriptionContracts(await access(req)))),
);
erp.post(
  '/organizations/:org/subscriptions/contracts',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSubscriptionContract(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/subscriptions/contracts/:id',
  route(async (req, res) =>
    res.json(
      await updateSubscriptionContract(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/subscriptions/proration/preview',
  route(async (req, res) =>
    res.json(await previewSubscriptionProration(await access(req), req.body)),
  ),
);
erp.get(
  '/organizations/:org/subscriptions/mrr-report',
  route(async (req, res) => res.json(await subscriptionMrrReport(await access(req)))),
);

// Phase 9: Support Helpdesk & Marketing Campaigns
erp.get(
  '/organizations/:org/support/tickets',
  route(async (req, res) => res.json(await listSupportTickets(await access(req)))),
);
erp.post(
  '/organizations/:org/support/tickets',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSupportTicket(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/support/tickets/:id',
  route(async (req, res) =>
    res.json(
      await updateSupportTicket(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/support/sla-report',
  route(async (req, res) => res.json(await supportSlaReport(await access(req)))),
);
erp.get(
  '/organizations/:org/marketing/campaigns',
  route(async (req, res) => res.json(await listMarketingCampaigns(await access(req)))),
);
erp.post(
  '/organizations/:org/marketing/campaigns',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createMarketingCampaign(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/marketing/campaigns/:id',
  route(async (req, res) =>
    res.json(
      await updateMarketingCampaign(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// Phase 10: Manufacturing (MRP), Maintenance, Fleet & Logistics
erp.get(
  '/organizations/:org/mrp/boms',
  route(async (req, res) => res.json(await listMrpBoms(await access(req)))),
);
erp.post(
  '/organizations/:org/mrp/boms',
  route(async (req, res) =>
    res.status(201).json(await createMrpBom(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/mrp/boms/cost-preview',
  route(async (req, res) => res.json(await previewMrpBomCost(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/mrp/orders',
  route(async (req, res) => res.json(await listMrpOrders(await access(req)))),
);
erp.post(
  '/organizations/:org/mrp/orders',
  route(async (req, res) =>
    res.status(201).json(await createMrpOrder(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/mrp/orders/:id',
  route(async (req, res) =>
    res.json(
      await updateMrpOrder(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/maintenance/requests',
  route(async (req, res) => res.json(await listMaintenanceRequests(await access(req)))),
);
erp.post(
  '/organizations/:org/maintenance/requests',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createMaintenanceRequest(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/maintenance/requests/:id',
  route(async (req, res) =>
    res.json(
      await updateMaintenanceRequest(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/fleet/vehicles',
  route(async (req, res) => res.json(await listFleetVehicles(await access(req)))),
);
erp.post(
  '/organizations/:org/fleet/vehicles',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createFleetVehicle(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/fleet/vehicles/:id',
  route(async (req, res) =>
    res.json(
      await updateFleetVehicle(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/logistics/shipments',
  route(async (req, res) => res.json(await listLogisticsShipments(await access(req)))),
);
erp.post(
  '/organizations/:org/logistics/shipments',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLogisticsShipment(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.patch(
  '/organizations/:org/logistics/shipments/:id',
  route(async (req, res) =>
    res.json(
      await updateLogisticsShipment(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// Cross-App Automatic Connections & Apps 17-26 Expansions
erp.post(
  '/organizations/:org/connections/sales/complete-sale',
  route(async (req, res) =>
    res
      .status(201)
      .json(await completeConnectedSale(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/subscriptions/contracts/:id/bill',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await billSubscriptionContract(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.post(
  '/organizations/:org/mrp/orders/:id/complete',
  route(async (req, res) =>
    res.json(
      await completeMrpOrderWithStock(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.get(
  '/organizations/:org/mrp/quality-checks',
  route(async (req, res) => res.json(await listMrpQualityChecks(await access(req)))),
);
erp.post(
  '/organizations/:org/support/tickets/:id/escalate',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await escalateSupportTicket(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/support/kb-articles',
  route(async (req, res) => res.json(await listSupportKbArticles(await access(req)))),
);
erp.post(
  '/organizations/:org/support/kb-articles',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSupportKbArticle(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/marketing/campaigns/:id/capture-lead',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await captureMarketingLead(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/field-ops/dispatches',
  route(async (req, res) => res.json(await listFieldDispatches(await access(req)))),
);
erp.post(
  '/organizations/:org/field-ops/dispatches',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createFieldDispatch(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/logistics/shipments/:id/pod',
  route(async (req, res) =>
    res.json(
      await recordLogisticsPod(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// App 23: Property & Hospitality
erp.get(
  '/organizations/:org/property/units',
  route(async (req, res) => res.json(await listPropertyUnits(await access(req)))),
);
erp.post(
  '/organizations/:org/property/units',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPropertyUnit(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/property/leases',
  route(async (req, res) => res.json(await listPropertyLeases(await access(req)))),
);
erp.post(
  '/organizations/:org/property/leases',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPropertyLease(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/property/leases/:id/bill',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await billPropertyLease(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);
erp.get(
  '/organizations/:org/property/reservations',
  route(async (req, res) => res.json(await listHospitalityReservations(await access(req)))),
);
erp.post(
  '/organizations/:org/property/reservations',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await createHospitalityReservation(await access(req, 'operations'), req.body, key(req)),
      ),
  ),
);
erp.post(
  '/organizations/:org/property/reservations/:id/checkout',
  route(async (req, res) =>
    res.json(
      await checkoutHospitalityReservation(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// App 24: Knowledge & Learning
erp.get(
  '/organizations/:org/learning/articles',
  route(async (req, res) => res.json(await listLearningArticles(await access(req)))),
);
erp.post(
  '/organizations/:org/learning/articles',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLearningArticle(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/learning/courses',
  route(async (req, res) => res.json(await listLearningCourses(await access(req)))),
);
erp.post(
  '/organizations/:org/learning/courses',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLearningCourse(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/learning/enrollments',
  route(async (req, res) => res.json(await listLearningEnrollments(await access(req)))),
);
erp.post(
  '/organizations/:org/learning/enrollments',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createLearningEnrollment(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/learning/enrollments/:id/assess',
  route(async (req, res) =>
    res.json(
      await submitLearningAssessment(
        await access(req, 'operations'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);

// App 25: AfriCore Studio
erp.get(
  '/organizations/:org/studio/apps',
  route(async (req, res) => res.json(await listStudioApps(await access(req)))),
);
erp.post(
  '/organizations/:org/studio/apps',
  route(async (req, res) =>
    res.status(201).json(await createStudioApp(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/studio/apps/:id/records',
  route(async (req, res) =>
    res.json(await listStudioRecords(await access(req), String(req.params.id))),
  ),
);
erp.post(
  '/organizations/:org/studio/apps/:id/records',
  route(async (req, res) =>
    res
      .status(201)
      .json(
        await createStudioRecord(
          await access(req, 'operations'),
          String(req.params.id),
          req.body,
          key(req),
        ),
      ),
  ),
);

// App 26: Integrations Hub
erp.get(
  '/organizations/:org/integrations-hub/connectors',
  route(async (req, res) => res.json(await listHubConnectors(await access(req)))),
);
erp.post(
  '/organizations/:org/integrations-hub/connectors',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createHubConnector(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/integrations-hub/pipelines',
  route(async (req, res) => res.json(await listHubPipelines(await access(req)))),
);
erp.post(
  '/organizations/:org/integrations-hub/pipelines',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createHubPipeline(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/integrations-hub/pipelines/:id/run',
  route(async (req, res) =>
    res.json(await runHubPipeline(await access(req, 'operations'), String(req.params.id), key(req))),
  ),
);
erp.get(
  '/organizations/:org/integrations-hub/events',
  route(async (req, res) => res.json(await listHubEvents(await access(req)))),
);
erp.get(
  '/organizations/:org/integrations-hub/topology',
  route(async (req, res) => res.json(await hubTopology(await access(req)))),
);

// App #1 Odoo Sales Parity (Promos, E-Signature, Commissions, Shipping, Variant Matrix, Invoicing Policy, Warnings)
erp.get(
  '/organizations/:org/sales/promos',
  route(async (req, res) => res.json(await listSalesPromos(await access(req)))),
);
erp.post(
  '/organizations/:org/sales/promos',
  route(async (req, res) =>
    res.status(201).json(await createSalesPromo(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/sales/promos/apply',
  route(async (req, res) =>
    res.json(await applySalesPromo(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/sales/signatures',
  route(async (req, res) => res.json(await listQuoteSignatures(await access(req)))),
);
erp.post(
  '/organizations/:org/sales/signatures',
  route(async (req, res) =>
    res.status(201).json(await signSalesQuote(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/sales/commissions/plans',
  route(async (req, res) => res.json(await listCommissionPlans(await access(req)))),
);
erp.post(
  '/organizations/:org/sales/commissions/plans',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCommissionPlan(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/sales/commissions/evaluate',
  route(async (req, res) => res.json(await evaluateSalesCommission(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/sales/shipping-methods',
  route(async (req, res) => res.json(await listShippingMethods(await access(req)))),
);
erp.post(
  '/organizations/:org/sales/shipping-methods',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createShippingMethod(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/sales/shipping-methods/calculate',
  route(async (req, res) => res.json(await calculateSalesShipping(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/sales/variant-matrix/expand',
  route(async (req, res) => res.json(await expandSalesVariantMatrix(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/sales/invoicing-policy/evaluate',
  route(async (req, res) =>
    res.json(await evaluateSalesInvoicingPolicy(await access(req), req.body)),
  ),
);
erp.get(
  '/organizations/:org/sales/warnings',
  route(async (req, res) => res.json(await listSalesWarnings(await access(req)))),
);
erp.post(
  '/organizations/:org/sales/warnings',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSalesWarning(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/sales/warnings/check',
  route(async (req, res) => res.json(await checkSalesWarnings(await access(req), req.body))),
);
// Accounting features (strict finance/accountant/admin/owner permission)
erp.post(
  '/organizations/:org/accounting/cash-flow',
  route(async (req, res) => res.json(await computeCashFlowStatement(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/accounting/fx-revaluations',
  route(async (req, res) => res.json(await listFxRevaluations(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/fx-revaluations',
  route(async (req, res) =>
    res.status(201).json(await runFxRevaluation(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/analytic-accounts',
  route(async (req, res) => res.json(await listAnalyticAccounts(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/analytic-accounts',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createAnalyticAccount(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/budgets',
  route(async (req, res) => res.json(await listBudgets(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/budgets',
  route(async (req, res) =>
    res.status(201).json(await createBudget(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/accounting/budgets/:id/evaluate',
  route(async (req, res) =>
    res.json(await evaluateBudget(await access(req), String(req.params.id), req.body)),
  ),
);
erp.get(
  '/organizations/:org/accounting/followup-levels',
  route(async (req, res) => res.json(await listFollowupLevels(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/followup-levels',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createFollowupLevel(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/accounting/followups/evaluate',
  route(async (req, res) => res.json(await evaluateFollowups(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/accounting/batch-payments',
  route(async (req, res) => res.json(await listBatchPayments(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/batch-payments',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createBatchPayment(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/accounting/debit-notes',
  route(async (req, res) => res.json(await listDebitNotes(await access(req)))),
);
erp.post(
  '/organizations/:org/accounting/debit-notes',
  route(async (req, res) =>
    res.status(201).json(await createDebitNote(await access(req, 'finance'), req.body, key(req))),
  ),
);
// CRM features (sales/operations/admin/owner permission)
erp.get(
  '/organizations/:org/crm/routing-rules',
  route(async (req, res) => res.json(await listCrmRoutingRules(await access(req)))),
);
erp.post(
  '/organizations/:org/crm/routing-rules',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCrmRoutingRule(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/crm/leads/route',
  route(async (req, res) => res.json(await evaluateCrmLeadRoute(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/crm/lost-reasons',
  route(async (req, res) => res.json(await listCrmLostReasons(await access(req)))),
);
erp.post(
  '/organizations/:org/crm/lost-reasons',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCrmLostReason(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/crm/analytics/win-loss',
  route(async (req, res) => res.json(await computeCrmWinLoss(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/crm/recurring/rollup',
  route(async (req, res) => res.json(await computeCrmRecurringRollup(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/crm/quotas',
  route(async (req, res) => res.json(await listCrmQuotas(await access(req)))),
);
erp.post(
  '/organizations/:org/crm/quotas',
  route(async (req, res) =>
    res.status(201).json(await createCrmQuota(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/crm/quotas/evaluate',
  route(async (req, res) => res.json(await evaluateCrmQuotas(await access(req)))),
);
erp.get(
  '/organizations/:org/crm/enrichments',
  route(async (req, res) => res.json(await listCrmEnrichments(await access(req)))),
);
erp.post(
  '/organizations/:org/crm/enrichments',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createCrmEnrichment(await access(req, 'sales'), req.body, key(req))),
  ),
);
// Inventory features (inventory_manager/operations/admin/owner permission)
erp.get(
  '/organizations/:org/inventory/reordering-rules',
  route(async (req, res) => res.json(await listReorderingRules(await access(req)))),
);
erp.post(
  '/organizations/:org/inventory/reordering-rules',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createReorderingRule(await access(req, 'inventory'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/inventory/replenishment/run',
  route(async (req, res) => res.json(await runReplenishment(await access(req, 'inventory'), req.body, key(req)))),
);
erp.get(
  '/organizations/:org/inventory/putaway-rules',
  route(async (req, res) => res.json(await listPutawayRules(await access(req)))),
);
erp.post(
  '/organizations/:org/inventory/putaway-rules',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createPutawayRule(await access(req, 'inventory'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/inventory/putaway/resolve',
  route(async (req, res) => res.json(await resolvePutawayLocation(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/inventory/waves/plan',
  route(async (req, res) => res.json(await planPickingWaves(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/inventory/packages',
  route(async (req, res) => res.json(await listStockPackages(await access(req)))),
);
erp.post(
  '/organizations/:org/inventory/packages',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createStockPackage(await access(req, 'inventory'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/inventory/barcode/scan',
  route(async (req, res) =>
    res
      .status(201)
      .json(await processBarcodeScan(await access(req, 'inventory'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/inventory/backorders/split',
  route(async (req, res) => res.json(await evaluateBackorderSplit(await access(req), req.body))),
);
// Procurement & POS features
erp.get(
  '/organizations/:org/procurement/vendor-tiers',
  route(async (req, res) => res.json(await listVendorTiers(await access(req)))),
);
erp.post(
  '/organizations/:org/procurement/vendor-tiers',
  route(async (req, res) =>
    res.status(201).json(await createVendorTier(await access(req, 'procurement'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/procurement/vendor-tiers/best',
  route(async (req, res) => res.json(await selectBestVendorTier(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/procurement/agreements/calloff',
  route(async (req, res) => res.json(await evaluateAgreementCalloff(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/procurement/vendors/scorecard',
  route(async (req, res) => res.json(await evaluateVendorScorecard(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/procurement/dropships',
  route(async (req, res) => res.json(await listDropships(await access(req)))),
);
erp.post(
  '/organizations/:org/procurement/dropships',
  route(async (req, res) =>
    res.status(201).json(await createDropship(await access(req, 'procurement'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/pos/floors',
  route(async (req, res) => res.json(await listPosFloors(await access(req)))),
);
erp.post(
  '/organizations/:org/pos/floors',
  route(async (req, res) =>
    res.status(201).json(await createPosFloor(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/pos/tables',
  route(async (req, res) =>
    res.status(201).json(await createPosTable(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/pos/kds/tickets',
  route(async (req, res) => res.json(await listKdsTickets(await access(req)))),
);
erp.post(
  '/organizations/:org/pos/kds/tickets',
  route(async (req, res) =>
    res.status(201).json(await createKdsTicket(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/pos/kds/tickets/:id/status',
  route(async (req, res) =>
    res.json(
      await updateKdsTicketStatus(
        await access(req, 'sales'),
        String(req.params.id),
        req.body,
        key(req),
      ),
    ),
  ),
);
erp.post(
  '/organizations/:org/pos/bills/split',
  route(async (req, res) => res.json(await calculateSplitBill(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/pos/combos/price',
  route(async (req, res) => res.json(await calculateComboPrice(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/pos/self-order/sessions',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createSelfOrderSession(await access(req, 'sales'), req.body, key(req))),
  ),
);
// Suite operations with domain-scoped permissions
erp.post(
  '/organizations/:org/work/profitability',
  route(async (req, res) => res.json(await evaluateWorkProfitability(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/people/shifts/overtime',
  route(async (req, res) => res.json(await evaluatePeopleOvertime(await access(req, 'hr'), req.body))),
);
erp.post(
  '/organizations/:org/commerce/abandoned-carts',
  route(async (req, res) => res.json(await evaluateAbandonedCarts(await access(req), req.body))),
);
erp.get(
  '/organizations/:org/commerce/wishlists',
  route(async (req, res) => res.json(await listWishlists(await access(req)))),
);
erp.post(
  '/organizations/:org/commerce/wishlists',
  route(async (req, res) =>
    res.status(201).json(await addWishlistItem(await access(req, 'sales'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/finance/treasury/runway',
  route(async (req, res) => res.json(await evaluateTreasuryRunway(await access(req, 'finance'), req.body))),
);
erp.get(
  '/organizations/:org/documents/sign/envelopes',
  route(async (req, res) => res.json(await listSignEnvelopes(await access(req)))),
);
erp.post(
  '/organizations/:org/documents/sign/envelopes',
  route(async (req, res) =>
    res.status(201).json(await createSignEnvelope(await access(req, 'operations'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/documents/sign/envelopes/:id/sign',
  route(async (req, res) =>
    res.json(await signEnvelope(await access(req, 'operations'), String(req.params.id), req.body, key(req))),
  ),
);
erp.get(
  '/organizations/:org/analytics/snapshots',
  route(async (req, res) => res.json(await listAnalyticsSnapshots(await access(req)))),
);
erp.post(
  '/organizations/:org/analytics/snapshots',
  route(async (req, res) =>
    res
      .status(201)
      .json(await createAnalyticsSnapshot(await access(req, 'finance'), req.body, key(req))),
  ),
);
erp.post(
  '/organizations/:org/marketing/funnel',
  route(async (req, res) => res.json(await evaluateMarketingFunnel(await access(req, 'marketing'), req.body))),
);
erp.post(
  '/organizations/:org/support/sla/evaluate',
  route(async (req, res) => res.json(await evaluateSupportSla(await access(req, 'support'), req.body))),
);
erp.post(
  '/organizations/:org/subscriptions/nrr',
  route(async (req, res) => res.json(await evaluateSubscriptionsNrr(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/mrp/workcenters/oee',
  route(async (req, res) => res.json(await evaluateMrpOee(await access(req, 'inventory'), req.body))),
);
erp.post(
  '/organizations/:org/field-ops/rentals/price',
  route(async (req, res) => res.json(await evaluateRentalPricing(await access(req, 'inventory'), req.body))),
);
erp.post(
  '/organizations/:org/property/revpar',
  route(async (req, res) => res.json(await evaluateHospitalityRevpar(await access(req), req.body))),
);
erp.post(
  '/organizations/:org/learning/quizzes/grade',
  route(async (req, res) => res.json(await gradeLearningQuiz(await access(req), req.body))),
);
