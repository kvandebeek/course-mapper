export const DISALLOWED_TITLE_KEYWORDS = [
  'Exam Prep',
  'AWS',
  'InDesign',
  'Azure',
  'Google Cloud',
  'GCP',
  'Sigma',
  'Microservices',
  'SAP',
  'Excel',
  'Powerpoint',
  'PowerPoint',
  'PowerPoint',
  'NVIDIA',
  'Figma',
  'Six Sigma',
  'NVIDIA',
  'AI Video',
  'Photoshop',
  'Illustrator',
  'After Effects',
  'Premiere Pro',
  'Canva',
  'UI/UX Design',
  'Graphic Design',
  'Video Editing',
  'Blender',
  '3D Modeling',
  'Accounting',
  'Finance',
  'Stock Trading',
  'Investing',
  'Cryptocurrency',
  'Blockchain',
  'Project Management Professional',
  'PMP',
  'Scrum Master Certification',
  'Agile PM',
  'MBA',
  'ChatGPT for Beginners',
  'Make Money with AI',
  'AI Side Hustle',
  'AI Marketing',
  'AI Content Creation',
  'Midjourney',
  'Stable Diffusion Art',
  'Prompting for Marketing',
  'No-Code AI',
  'Arduino',
  'Raspberry Pi',
  'FPGA',
  'Embedded Systems',
  'IoT Development',
  'Electronics',
  'Robotics',
  'Full Stack Bootcamp',
  'Complete Web Developer',
  'React Native',
  'Flutter',
  'iOS Development',
  'Android Development',
  'Game Development',
  'Unity',
  'Unreal Engine',
  'AWS Certified',
  'Azure Fundamentals',
  'Google Associate',
  'Cloud Practitioner',
  'Solutions Architect',
  'DevOps Engineer Certification',
  'Terraform',
  'Kubernetes',
  'Docker',
  'Red Hat',
  'OpenShift',
  'Power BI',
  'Tableau',
  'Data Science',
  'Data Analytics',
  'Machine Learning Bootcamp',
  'Deep Learning',
  'R Programming',
  'Statistics',
  'SPSS',
  'SQL for Data Science',
  'Business Intelligence',
  'Microsoft Word',
  'Word Advanced',
  'Excel VBA',
  'Excel Macros',
  'Outlook',
  'Microsoft 365',
  'SharePoint',
  'Google Sheets'
] as const;

export interface BlockedKeywordResult {
  readonly blocked: boolean;
  readonly matched?: string;
}

export function isBlockedByKeyword(title: string): BlockedKeywordResult {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  if (normalizedTitle.length === 0) {
    return { blocked: false };
  }

  for (const keyword of DISALLOWED_TITLE_KEYWORDS) {
    if (normalizedTitle.includes(keyword.toLocaleLowerCase())) {
      return {
        blocked: true,
        matched: keyword
      };
    }
  }

  return { blocked: false };
}
