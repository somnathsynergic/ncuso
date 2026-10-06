// Single source of truth for the form. Shared by the browser (rendering + validation)
// and the server (validation). Add/reorder fields here and the UI follows.

const YES_NO = ['Yes', 'No'];

export const steps = [
  {
    id: 'school',
    title: 'School Details',
    subtitle: 'Basic identity & contact',
    icon: '🏫',
    fields: [
      { name: 'schoolName', label: 'School Name', type: 'text', placeholder: 'Enter the full school name' },
      {
        name: 'udiseNo', label: 'UDISE No.', type: 'text', inputMode: 'numeric', maxLength: 11,
        hint: 'If not registered on the UDISE portal, write eleven 9s (99999999999).',
        pattern: /^\d{11}$/, patternMessage: 'UDISE number must be exactly 11 digits',
      },
      {
        name: 'mobile', label: 'Mobile / WhatsApp No.', type: 'tel', inputMode: 'numeric', maxLength: 10,
        pattern: /^[6-9]\d{9}$/, patternMessage: 'Enter a valid 10-digit mobile number',
      },
      {
        name: 'email', label: 'Email ID', type: 'email', inputMode: 'email', maxLength: 50, placeholder: 'name@example.com',
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMessage: 'Enter a valid email address',
      },
      {
        name: 'yearEstablished', label: 'Year of Establishment', type: 'year', min: 1800, max: new Date().getFullYear(),
        placeholder: 'Select year',
      },
      // Options are loaded from /api/districts (table md_districts) at startup
      { name: 'district', label: 'Name the District', type: 'select', optionsUrl: '/api/districts', options: [] },
      { name: 'circle', label: 'Name the Circle of the School', type: 'text' },
    ],
  },
  {
    id: 'application',
    title: 'Application & Type',
    subtitle: 'NOC history and school level',
    icon: '📄',
    fields: [
      { name: 'previouslyAppliedNoc', label: 'Previously, applied for NOC', type: 'radio', options: YES_NO },
      {
        name: 'schoolType', label: 'Type of School', type: 'radio',
        options: ['PRE-PRIMARY & PRIMARY', 'ONLY PRIMARY', 'UPTO UPPER PRIMARY', 'SECONDARY', 'HIGHER SECONDARY'],
      },
    ],
  },
  {
    id: 'people',
    title: 'Students & Teachers',
    subtitle: 'Enrolment and staff strength',
    icon: '🎓',
    fields: [
      { name: 'totalStudents', label: 'Total No. of Students', type: 'number', min: 0 },
      { name: 'totalBoys', label: 'Total No. of Boys', type: 'number', min: 0 },
      { name: 'totalGirls', label: 'Total No. of Girls', type: 'number', min: 0 },
      { name: 'totalTeachers', label: 'Total No. of Teachers Available', type: 'number', min: 0 },
      { name: 'untrainedTeachers', label: 'No. of Untrained Teachers', type: 'number', min: 0 },
      {
        name: 'avgSalary', label: 'Avg. Teacher Salary / Gross Pay P.M. (in Rs.)', type: 'number', min: 0, max: 99999999, prefix: '₹',
      },
    ],
    // Cross-field rules: return { fieldName: message } for any problems
    rules: (v) => {
      const e = {};
      const n = (k) => Number(v[k]);
      if (v.totalStudents !== '' && v.totalBoys !== '' && v.totalGirls !== '' &&
          n('totalBoys') + n('totalGirls') !== n('totalStudents')) {
        e.totalStudents = 'Boys + Girls must equal the total number of students';
      }
      if (v.totalTeachers !== '' && v.untrainedTeachers !== '' && n('untrainedTeachers') > n('totalTeachers')) {
        e.untrainedTeachers = 'Cannot exceed the total number of teachers';
      }
      return e;
    },
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    subtitle: 'Rooms, building plan & lease',
    icon: '🏗️',
    fields: [
      { name: 'totalClassrooms', label: 'Total Number of Class Rooms', type: 'number', min: 0 },
      { name: 'classroomsBelow400', label: 'Total Number of Class Rooms below 400 Sq. Ft.', type: 'number', min: 0 },
      { name: 'sanctionedPlan', label: 'The school has a sanctioned building plan', type: 'radio', options: ['Yes', 'No', 'Applied / Applying'] },
      { name: 'needsLease', label: 'The school has a need to take the property on lease', type: 'radio', options: YES_NO },
      { name: 'lease20Possible', label: 'The lease deed for 20 years of the school building is possible', type: 'radio', options: YES_NO },
    ],
    rules: (v) => {
      const e = {};
      if (v.totalClassrooms !== '' && v.classroomsBelow400 !== '' && Number(v.classroomsBelow400) > Number(v.totalClassrooms)) {
        e.classroomsBelow400 = 'Cannot exceed the total number of class rooms';
      }
      return e;
    },
  },
  {
    id: 'compliance',
    title: 'Non-Compliances',
    subtitle: 'Major points affecting your NOC',
    icon: '⚠️',
    fields: [
      {
        name: 'nonCompliances', label: 'Major Points of Non-Compliances', type: 'checkbox',
        hint: 'Select all that apply.',
        options: [
          'NATURE OF LAND', 'PROPRIETARY OF LAND', 'LEASE DEED FOR 20 YEARS',
          'ROOM SIZE OF 400 Sq. Ft.', '100% TRAINED TEACHERS', 'PAY AS PER ROPA 2009',
        ],
      },
    ],
  },
];

export const allFields = steps.flatMap((s) => s.fields);
