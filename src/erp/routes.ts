import { workRules, saveWorkRules } from './work-automation';
import {
  setProjectTemplate,
  workTemplates,
  workSalesSources,
  projectFromSales,
} from './work-templates';
import { taxCodes, saveTaxCode, previewTaxEntry, prepareTaxEntry } from './accounting-tax';
import { accountingAging } from './accounting-aging';
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
  employeeHistory,
  compensationRecords,
  recordCompensation,
} from './people-profiles';
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
import { route, access } from '../platform/auth';
import {
  myWork,
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
  '/organizations/:org/accounting/aging',
  route(async (req, res) => res.json(await accountingAging(await access(req), req.query))),
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
    res.status(201).json(
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
    res.status(201).json(
      await bookCalendarAppointment(
        await access(req),
        String(req.params.id),
        req.body,
        key(req),
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
