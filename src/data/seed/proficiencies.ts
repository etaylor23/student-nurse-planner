// AUTO-GENERATED — do not edit by hand.
// Source: NMC 'Standards of proficiency for registered nurses' (2024 update).
// Regenerate via scripts/extract-proficiencies.py (authoring-time only).
// Granularity: individual proficiency statements. Platform items use codes
// like "1.1"; annexe items are prefixed "A"/"B". The few 3rd/4th-level
// sub-bullets in Annexe A s.4 and Annexe B s.1 are folded into their parent's
// statement text, verbatim. 219 statements total.
import type { Proficiency } from "../../domain/types";

/** Provenance for the seeded proficiency master list — surfaced in the UI. */
export interface ProficiencySource {
  title: string;
  author: string;
  edition: string;
  url: string;
  retrievedOn: string;
}

export const PROFICIENCY_SOURCE: ProficiencySource = {
  title: "Standards of proficiency for registered nurses",
  author: "Nursing and Midwifery Council (NMC)",
  edition: "2024 update",
  url: "https://www.nmc.org.uk/globalassets/sitedocuments/standards/2024/printer-friendly/standards-of-proficiency-for-nurses-print_friendly.pdf",
  retrievedOn: "2026-06-22",
};

/** Short framing text per platform / annexe (official intro), for headers. */
export const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  "1": "Registered nurses act in the best interests of people, putting them first and providing nursing care that is person-centred, safe and compassionate. They act professionally at all times and use their knowledge and experience to make evidence-based decisions about care. They communicate effectively, are role models for others, and are accountable for their actions. Registered nurses continually reflect on their practice and keep abreast of new and emerging developments in nursing, health and care.",
  "2": "Registered nurses play a key role in improving and maintaining the mental, physical and behavioural health and wellbeing of people, families, communities and populations. They support and enable people at all stages of life and in all care settings to make informed choices about how to manage health challenges in order to maximise their quality of life and improve health outcomes. They are actively involved in the prevention of and protection against disease and ill health and engage in public health, community development and global health agendas, and in the reduction of health inequalities.",
  "3": "Registered nurses prioritise the needs of people when assessing and reviewing their mental, physical, cognitive, behavioural, social and spiritual needs. They use information obtained during assessments to identify the priorities and requirements for person-centred and evidence-based nursing interventions and support. They work in partnership with people to develop person-centred care plans that take into account their circumstances, characteristics and preferences.",
  "4": "Registered nurses take the lead in providing evidence-based, compassionate and safe nursing interventions. They ensure that care they provide and delegate is person-centred and of a consistently high standard. They support people of all ages in a range of care settings. They work in partnership with people, families and carers to evaluate whether care is effective and the goals of care have been met in line with their wishes, preferences and desired outcomes.",
  "5": "Registered nurses provide leadership by acting as a role model for best practice in the delivery of nursing care. They are responsible for managing nursing care and are accountable for the appropriate delegation and supervision of care provided by others in the team including lay carers. They play an active and equal role in the interdisciplinary team, collaborating and communicating effectively with a range of colleagues.",
  "6": "Registered nurses make a key contribution to the continuous monitoring and quality improvement of care and treatment in order to enhance health outcomes and people’s experience of nursing and related care. They assess risks to safety or experience and take appropriate action to manage those, putting the best interests, needs and preferences of people first.",
  "7": "Registered nurses play a leadership role in coordinating and managing the complex nursing and integrated care needs of people at any stage of their lives, across a range of organisations and settings. They contribute to processes of organisational change through an awareness of local and national policies.",
  A: "The communication and relationship management skills that a newly registered nurse must be able to demonstrate to meet the proficiency outcomes outlined in the main body of this document.",
  B: "The nursing procedures that a newly registered nurse must be able to demonstrate to meet the proficiency outcomes outlined in the main body of this document.",
};

export const seedProficiencies: Proficiency[] = [
  {
    id: "prof_1.1",
    code: "1.1",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 0,
    statement:
      "understand and act in accordance with The Code: Professional standards of practice and behaviour for nurses, midwives and nursing associates, and fulfil all registration requirements",
  },
  {
    id: "prof_1.2",
    code: "1.2",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 1,
    statement:
      "understand and apply relevant legal, regulatory and governance requirements, policies, and ethical frameworks, including any mandatory reporting duties, to all areas of practice, differentiating where appropriate between the devolved legislatures of the United Kingdom",
  },
  {
    id: "prof_1.3",
    code: "1.3",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 2,
    statement:
      "understand and apply the principles of courage, transparency and the professional duty of candour, recognising and reporting any situations, behaviours or errors that could result in poor care outcomes",
  },
  {
    id: "prof_1.4",
    code: "1.4",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 3,
    statement:
      "demonstrate an understanding of, and the ability to challenge, discriminatory behaviour",
  },
  {
    id: "prof_1.5",
    code: "1.5",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 4,
    statement:
      "understand the demands of professional practice and demonstrate how to recognise signs of vulnerability in themselves or their colleagues and the action required to minimise risks to health",
  },
  {
    id: "prof_1.6",
    code: "1.6",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 5,
    statement:
      "understand the professional responsibility to adopt a healthy lifestyle to maintain the level of personal fitness and wellbeing required to meet people’s needs for mental and physical care",
  },
  {
    id: "prof_1.7",
    code: "1.7",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 6,
    statement:
      "demonstrate an understanding of research methods, ethics and governance in order to critically analyse, safely use, share and apply research findings to promote and inform best nursing practice",
  },
  {
    id: "prof_1.8",
    code: "1.8",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 7,
    statement:
      "demonstrate the knowledge, skills and ability to think critically when applying evidence and drawing on experience to make evidence-informed decisions in all situations",
  },
  {
    id: "prof_1.9",
    code: "1.9",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 8,
    statement:
      "understand the need to base all decisions regarding care and interventions on people’s needs and preferences, recognising and addressing any personal and external factors that may unduly influence their decisions",
  },
  {
    id: "prof_1.10",
    code: "1.10",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 9,
    statement:
      "demonstrate resilience and emotional intelligence and be capable of explaining the rationale that influences their judgements and decisions in routine, complex and challenging situations",
  },
  {
    id: "prof_1.11",
    code: "1.11",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 10,
    statement:
      "communicate effectively using a range of skills and strategies with colleagues and people at all stages of life and with a range of mental, physical, cognitive and behavioural health challenges",
  },
  {
    id: "prof_1.12",
    code: "1.12",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 11,
    statement:
      "demonstrate the skills and abilities required to support people at all stages of life who are emotionally or physically vulnerable",
  },
  {
    id: "prof_1.13",
    code: "1.13",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 12,
    statement:
      "demonstrate the skills and abilities required to develop, manage and maintain appropriate relationships with people, their families, carers and colleagues",
  },
  {
    id: "prof_1.14",
    code: "1.14",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 13,
    statement:
      "provide and promote non-discriminatory, person-centred and sensitive care at all times, reflecting on people’s values and beliefs, diverse backgrounds, cultural characteristics, language requirements, needs and preferences, taking account of any need for adjustments",
  },
  {
    id: "prof_1.15",
    code: "1.15",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 14,
    statement:
      "demonstrate the numeracy, literacy, digital and technological skills required to meet the needs of people in their care to ensure safe and effective nursing practice",
  },
  {
    id: "prof_1.16",
    code: "1.16",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 15,
    statement: "demonstrate the ability to keep complete, clear, accurate and timely records",
  },
  {
    id: "prof_1.17",
    code: "1.17",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 16,
    statement:
      "take responsibility for continuous self-reflection, seeking and responding to support and feedback to develop their professional knowledge and skills",
  },
  {
    id: "prof_1.18",
    code: "1.18",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 17,
    statement:
      "demonstrate the knowledge and confidence to contribute effectively and proactively in an interdisciplinary team",
  },
  {
    id: "prof_1.19",
    code: "1.19",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 18,
    statement:
      "act as an ambassador, upholding the reputation of their profession and promoting public confidence in nursing, health and care services",
  },
  {
    id: "prof_1.20",
    code: "1.20",
    platform: 1,
    platformTitle: "Being an accountable professional",
    annexe: "NONE",
    orderIndex: 19,
    statement:
      "safely demonstrate evidence-based practice in all skills and procedures stated in Annexes A and B.",
  },
  {
    id: "prof_2.1",
    code: "2.1",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 20,
    statement:
      "understand and apply the aims and principles of health promotion, protection and improvement and the prevention of ill health when engaging with people",
  },
  {
    id: "prof_2.2",
    code: "2.2",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 21,
    statement:
      "demonstrate knowledge of epidemiology, demography, genomics and the wider determinants of health, illness and wellbeing and apply this to an understanding of global patterns of health and wellbeing outcomes",
  },
  {
    id: "prof_2.3",
    code: "2.3",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 22,
    statement: "understand the factors that may lead to inequalities in health outcomes",
  },
  {
    id: "prof_2.4",
    code: "2.4",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 23,
    statement:
      "identify and use all appropriate opportunities, making reasonable adjustments when required, to discuss the impact of smoking, substance and alcohol use, sexual behaviours, diet and exercise on mental, physical and behavioural health and wellbeing, in the context of people’s individual circumstances",
  },
  {
    id: "prof_2.5",
    code: "2.5",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 24,
    statement:
      "promote and improve mental, physical, behavioural and other health related outcomes by understanding and explaining the principles, practice and evidence base for health screening programmes",
  },
  {
    id: "prof_2.6",
    code: "2.6",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 25,
    statement:
      "understand the importance of early years and childhood experiences and the possible impact on life choices, mental, physical and behavioural health and wellbeing",
  },
  {
    id: "prof_2.7",
    code: "2.7",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 26,
    statement:
      "understand and explain the contribution of social influences, health literacy, individual circumstances, behaviours and lifestyle choices to mental, physical and behavioural health outcomes",
  },
  {
    id: "prof_2.8",
    code: "2.8",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 27,
    statement:
      "explain and demonstrate the use of up to date approaches to behaviour change to enable people to use their strengths and expertise and make informed choices when managing their own health and making lifestyle adjustments",
  },
  {
    id: "prof_2.9",
    code: "2.9",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 28,
    statement:
      "use appropriate communication skills and strength-based approaches to support and enable people to make informed choices about their care to manage health challenges in order to have satisfying and fulfilling lives within the limitations caused by reduced capability, ill health and disability",
  },
  {
    id: "prof_2.10",
    code: "2.10",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 29,
    statement:
      "provide information in accessible ways to help people understand and make decisions about their health, life choices, illness and care",
  },
  {
    id: "prof_2.11",
    code: "2.11",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 30,
    statement:
      "promote health and prevent ill health by understanding and explaining to people the principles of pathogenesis, immunology and the evidence-base for immunisation, vaccination and herd immunity",
  },
  {
    id: "prof_2.12",
    code: "2.12",
    platform: 2,
    platformTitle: "Promoting health and preventing ill health",
    annexe: "NONE",
    orderIndex: 31,
    statement:
      "protect health through understanding and applying the principles of infection prevention and control, including communicable disease surveillance and antimicrobial stewardship and resistance.",
  },
  {
    id: "prof_3.1",
    code: "3.1",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 32,
    statement:
      "demonstrate and apply knowledge of human development from conception to death when undertaking full and accurate person-centred nursing assessments and developing appropriate care plans",
  },
  {
    id: "prof_3.2",
    code: "3.2",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 33,
    statement:
      "demonstrate and apply knowledge of body systems and homeostasis, human anatomy and physiology, biology, genomics, pharmacology and social and behavioural sciences when undertaking full and accurate person-centred nursing assessments and developing appropriate care plans",
  },
  {
    id: "prof_3.3",
    code: "3.3",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 34,
    statement:
      "demonstrate and apply knowledge of all commonly encountered mental, physical, behavioural and cognitive health conditions, medication usage and treatments when undertaking full and accurate assessments of nursing care needs and when developing, prioritising and reviewing person-centred care plans",
  },
  {
    id: "prof_3.4",
    code: "3.4",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 35,
    statement:
      "understand and apply a person-centred approach to nursing care, demonstrating shared assessment, planning, decision-making and goal setting when working with people, their families, communities and populations of all ages",
  },
  {
    id: "prof_3.5",
    code: "3.5",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 36,
    statement:
      "demonstrate the ability to accurately process all information gathered during the assessment process to identify needs for individualised nursing care and develop person-centred evidence-based plans for nursing interventions with agreed goals",
  },
  {
    id: "prof_3.6",
    code: "3.6",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 37,
    statement:
      "effectively assess a person’s capacity to make decisions about their own care and to give or withhold consent",
  },
  {
    id: "prof_3.7",
    code: "3.7",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 38,
    statement:
      "understand and apply the principles and processes for making reasonable adjustments",
  },
  {
    id: "prof_3.8",
    code: "3.8",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 39,
    statement:
      "understand and apply the relevant laws about mental capacity for the country in which you are practising when making decisions in relation to people who do not have capacity",
  },
  {
    id: "prof_3.9",
    code: "3.9",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 40,
    statement:
      "recognise and assess people at risk of harm and the situations that may put them at risk, ensuring prompt action is taken to safeguard those who are vulnerable",
  },
  {
    id: "prof_3.10",
    code: "3.10",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 41,
    statement:
      "demonstrate the skills and abilities required to recognise and assess people who show signs of self-harm and/or suicidal ideation",
  },
  {
    id: "prof_3.11",
    code: "3.11",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 42,
    statement: "undertake routine investigations, interpreting and sharing findings as appropriate",
  },
  {
    id: "prof_3.12",
    code: "3.12",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 43,
    statement:
      "interpret results from routine investigations, taking prompt action when required by implementing appropriate interventions, requesting additional investigations or escalating to others",
  },
  {
    id: "prof_3.13",
    code: "3.13",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 44,
    statement:
      "demonstrate an understanding of co-morbidities and the demands of meeting people’s complex nursing and social care needs when prioritising care plans",
  },
  {
    id: "prof_3.14",
    code: "3.14",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 45,
    statement:
      "identify and assess the needs of people and families for care at the end of life, including requirements for palliative care and decision making related to their treatment and care preferences",
  },
  {
    id: "prof_3.15",
    code: "3.15",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 46,
    statement:
      "demonstrate the ability to work in partnership with people, families and carers to continuously monitor, evaluate and reassess the effectiveness of all agreed nursing care plans and care, sharing decision-making and readjusting agreed goals, documenting progress and decisions made",
  },
  {
    id: "prof_3.16",
    code: "3.16",
    platform: 3,
    platformTitle: "Assessing needs and planning care",
    annexe: "NONE",
    orderIndex: 47,
    statement:
      "demonstrate knowledge of when and how to refer people safely to other professionals or services for clinical intervention or support.",
  },
  {
    id: "prof_4.1",
    code: "4.1",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 48,
    statement:
      "demonstrate and apply an understanding of what is important to people and how to use this knowledge to ensure their needs for safety, dignity, privacy, comfort and sleep can be met, acting as a role model for others in providing evidence based care",
  },
  {
    id: "prof_4.2",
    code: "4.2",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 49,
    statement:
      "work in partnership with people to encourage shared decision making in order to support individuals, their families and carers to manage their own care when appropriate",
  },
  {
    id: "prof_4.3",
    code: "4.3",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 50,
    statement:
      "demonstrate the knowledge, communication and relationship management skills required to provide people, families and carers with accurate information that meets their needs before, during and after a range of interventions",
  },
  {
    id: "prof_4.4",
    code: "4.4",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 51,
    statement:
      "demonstrate the knowledge and skills required to support people with commonly encountered mental health, behavioural, cognitive and learning challenges, and act as a role model for others in providing high quality nursing interventions to meet people’s needs",
  },
  {
    id: "prof_4.5",
    code: "4.5",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 52,
    statement:
      "demonstrate the knowledge and skills required to support people with commonly encountered physical health conditions, their medication usage and treatments, and act as a role model for others in providing high quality nursing interventions when meeting people’s needs",
  },
  {
    id: "prof_4.6",
    code: "4.6",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 53,
    statement:
      "demonstrate the knowledge, skills and ability to act as a role model for others in providing evidence-based nursing care to meet people’s needs related to nutrition, hydration and bladder and bowel health",
  },
  {
    id: "prof_4.7",
    code: "4.7",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 54,
    statement:
      "demonstrate the knowledge, skills and ability to act as a role model for others in providing evidence-based, person-centred nursing care to meet people’s needs related to mobility, hygiene, oral care, wound care and skin integrity",
  },
  {
    id: "prof_4.8",
    code: "4.8",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 55,
    statement:
      "demonstrate the knowledge and skills required to identify and initiate appropriate interventions to support people with commonly encountered symptoms including anxiety, confusion, discomfort and pain",
  },
  {
    id: "prof_4.9",
    code: "4.9",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 56,
    statement:
      "demonstrate the knowledge and skills required to prioritise what is important to people and their families when providing evidence-based person-centred nursing care at end of life including the care of people who are dying, families, the deceased and the bereaved",
  },
  {
    id: "prof_4.10",
    code: "4.10",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 57,
    statement:
      "demonstrate the knowledge and ability to respond proactively and promptly to signs of deterioration or distress in mental, physical, cognitive and behavioural health and use this knowledge to make sound clinical decisions",
  },
  {
    id: "prof_4.11",
    code: "4.11",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 58,
    statement:
      "demonstrate the knowledge and skills required to initiate and evaluate appropriate interventions to support people who show signs of self-harm and/or suicidal ideation",
  },
  {
    id: "prof_4.12",
    code: "4.12",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 59,
    statement:
      "demonstrate the ability to manage commonly encountered devices and confidently carry out related nursing procedures to meet people’s needs for evidence-based, person-centred care",
  },
  {
    id: "prof_4.13",
    code: "4.13",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 60,
    statement:
      "demonstrate the knowledge, skills and confidence to provide first aid procedures and basic life support",
  },
  {
    id: "prof_4.14",
    code: "4.14",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 61,
    statement:
      "understand the principles of safe and effective administration and optimisation of medicines in accordance with local and national policies and demonstrate proficiency and accuracy when calculating dosages of prescribed medicines",
  },
  {
    id: "prof_4.15",
    code: "4.15",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 62,
    statement:
      "demonstrate knowledge of pharmacology and the ability to recognise the effects of medicines, allergies, drug sensitivities, side effects, contraindications, incompatibilities, adverse reactions, prescribing errors and the impact of polypharmacy and over the counter medication usage",
  },
  {
    id: "prof_4.16",
    code: "4.16",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 63,
    statement:
      "demonstrate knowledge of how prescriptions can be generated, the role of generic, unlicensed, and off-label prescribing and an understanding of the potential risks associated with these approaches to prescribing",
  },
  {
    id: "prof_4.17",
    code: "4.17",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 64,
    statement:
      "apply knowledge of pharmacology to the care of people, demonstrating the ability to progress to a prescribing qualification following registration",
  },
  {
    id: "prof_4.18",
    code: "4.18",
    platform: 4,
    platformTitle: "Providing and evaluating care",
    annexe: "NONE",
    orderIndex: 65,
    statement:
      "demonstrate the ability to coordinate and undertake the processes and procedures involved in routine planning and management of safe discharge home or transfer of people between care settings.",
  },
  {
    id: "prof_5.1",
    code: "5.1",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 66,
    statement:
      "understand the principles of effective leadership, management, group and organisational dynamics and culture and apply these to team working and decision-making",
  },
  {
    id: "prof_5.2",
    code: "5.2",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 67,
    statement:
      "understand and apply the principles of human factors, environmental factors and strength-based approaches when working in teams",
  },
  {
    id: "prof_5.3",
    code: "5.3",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 68,
    statement:
      "understand the principles and application of processes for performance management and how these apply to the nursing team",
  },
  {
    id: "prof_5.4",
    code: "5.4",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 69,
    statement:
      "demonstrate an understanding of the roles, responsibilities and scope of practice of all members of the nursing and interdisciplinary team and how to make best use of the contributions of others involved in providing care",
  },
  {
    id: "prof_5.5",
    code: "5.5",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 70,
    statement:
      "safely and effectively lead and manage the nursing care of a group of people, demonstrating appropriate prioritisation, delegation and assignment of care responsibilities to others involved in providing care",
  },
  {
    id: "prof_5.6",
    code: "5.6",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 71,
    statement:
      "exhibit leadership potential by demonstrating an ability to guide, support and motivate individuals and interact confidently with other members of the care team",
  },
  {
    id: "prof_5.7",
    code: "5.7",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 72,
    statement:
      "demonstrate the ability to monitor and evaluate the quality of care delivered by others in the team and lay carers",
  },
  {
    id: "prof_5.8",
    code: "5.8",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 73,
    statement:
      "support and supervise students in the delivery of nursing care, promoting reflection and providing constructive feedback, and evaluating and documenting their performance",
  },
  {
    id: "prof_5.9",
    code: "5.9",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 74,
    statement:
      "demonstrate the ability to challenge and provide constructive feedback about care delivered by others in the team, and support them to identify and agree individual learning needs",
  },
  {
    id: "prof_5.10",
    code: "5.10",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 75,
    statement:
      "contribute to supervision and team reflection activities to promote improvements in practice and services",
  },
  {
    id: "prof_5.11",
    code: "5.11",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 76,
    statement:
      "effectively and responsibly use a range of digital technologies to access, input, share and apply information and data within teams and between agencies",
  },
  {
    id: "prof_5.12",
    code: "5.12",
    platform: 5,
    platformTitle: "Leading and managing nursing care and working in teams",
    annexe: "NONE",
    orderIndex: 77,
    statement:
      "understand the mechanisms that can be used to influence organisational change and public policy, demonstrating the development of political awareness and skills.",
  },
  {
    id: "prof_6.1",
    code: "6.1",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 78,
    statement:
      "understand and apply the principles of health and safety legislation and regulations and maintain safe work and care environments",
  },
  {
    id: "prof_6.2",
    code: "6.2",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 79,
    statement:
      "understand the relationship between safe staffing levels, appropriate skills mix, safety and quality of care, recognising risks to public protection and quality of care, escalating concerns appropriately",
  },
  {
    id: "prof_6.3",
    code: "6.3",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 80,
    statement:
      "comply with local and national frameworks, legislation and regulations for assessing, managing and reporting risks, ensuring the appropriate action is taken",
  },
  {
    id: "prof_6.4",
    code: "6.4",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 81,
    statement:
      "demonstrate an understanding of the principles of improvement methodologies, participate in all stages of audit activity and identify appropriate quality improvement strategies",
  },
  {
    id: "prof_6.5",
    code: "6.5",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 82,
    statement:
      "demonstrate the ability to accurately undertake risk assessments in a range of care settings, using a range of contemporary assessment and improvement tools",
  },
  {
    id: "prof_6.6",
    code: "6.6",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 83,
    statement:
      "identify the need to make improvements and proactively respond to potential hazards that may affect the safety of people",
  },
  {
    id: "prof_6.7",
    code: "6.7",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 84,
    statement:
      "understand how the quality and effectiveness of nursing care can be evaluated in practice, and demonstrate how to use service delivery evaluation and audit findings to bring about continuous improvement",
  },
  {
    id: "prof_6.8",
    code: "6.8",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 85,
    statement:
      "demonstrate an understanding of how to identify, report and critically reflect on near misses, critical incidents, major incidents and serious adverse events in order to learn from them and influence their future practice",
  },
  {
    id: "prof_6.9",
    code: "6.9",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 86,
    statement:
      "work with people, their families, carers and colleagues to develop effective improvement strategies for quality and safety, sharing feedback and learning from positive outcomes and experiences, mistakes and adverse outcomes and experiences",
  },
  {
    id: "prof_6.10",
    code: "6.10",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 87,
    statement:
      "apply an understanding of the differences between risk aversion and risk management and how to avoid compromising quality of care and health outcomes",
  },
  {
    id: "prof_6.11",
    code: "6.11",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 88,
    statement:
      "acknowledge the need to accept and manage uncertainty, and demonstrate an understanding of strategies that develop resilience in self and others",
  },
  {
    id: "prof_6.12",
    code: "6.12",
    platform: 6,
    platformTitle: "Improving safety and quality of care",
    annexe: "NONE",
    orderIndex: 89,
    statement:
      "understand the role of registered nurses and other health and care professionals at different levels of experience and seniority when managing and prioritising actions and care in the event of a major incident.",
  },
  {
    id: "prof_7.1",
    code: "7.1",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 90,
    statement:
      "understand and apply the principles of partnership, collaboration and interagency working across all relevant sectors",
  },
  {
    id: "prof_7.2",
    code: "7.2",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 91,
    statement:
      "understand health legislation and current health and social care policies, and the mechanisms involved in influencing policy development and change, differentiating where appropriate between the devolved legislatures of the United Kingdom",
  },
  {
    id: "prof_7.3",
    code: "7.3",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 92,
    statement:
      "understand the principles of health economics and their relevance to resource allocation in health and social care organisations and other agencies",
  },
  {
    id: "prof_7.4",
    code: "7.4",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 93,
    statement:
      "identify the implications of current health policy and future policy changes for nursing and other professions and understand the impact of policy changes on the delivery and coordination of care",
  },
  {
    id: "prof_7.5",
    code: "7.5",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 94,
    statement:
      "understand and recognise the need to respond to the challenges of providing safe, effective and person-centred nursing care for people who have co-morbidities and complex care needs",
  },
  {
    id: "prof_7.6",
    code: "7.6",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 95,
    statement:
      "demonstrate an understanding of the complexities of providing mental, cognitive, behavioural and physical care services across a wide range of integrated care settings",
  },
  {
    id: "prof_7.7",
    code: "7.7",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 96,
    statement:
      "understand how to monitor and evaluate the quality of people’s experience of complex care",
  },
  {
    id: "prof_7.8",
    code: "7.8",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 97,
    statement:
      "understand the principles and processes involved in supporting people and families with a range of care needs to maintain optimal independence and avoid unnecessary interventions and disruptions to their lives",
  },
  {
    id: "prof_7.9",
    code: "7.9",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 98,
    statement:
      "facilitate equitable access to healthcare for people who are vulnerable or have a disability, demonstrate the ability to advocate on their behalf when required, and make necessary reasonable adjustments to the assessment, planning and delivery of their care",
  },
  {
    id: "prof_7.10",
    code: "7.10",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 99,
    statement:
      "understand the principles and processes involved in planning and facilitating the safe discharge and transition of people between caseloads, settings and services",
  },
  {
    id: "prof_7.11",
    code: "7.11",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 100,
    statement:
      "demonstrate the ability to identify and manage risks and take proactive measures to improve the quality of care and services when needed",
  },
  {
    id: "prof_7.12",
    code: "7.12",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 101,
    statement:
      "demonstrate an understanding of the processes involved in developing a basic business case for additional care funding by applying knowledge of finance, resources and safe staffing levels",
  },
  {
    id: "prof_7.13",
    code: "7.13",
    platform: 7,
    platformTitle: "Coordinating care",
    annexe: "NONE",
    orderIndex: 102,
    statement:
      "demonstrate an understanding of the importance of exercising political awareness throughout their career, to maximise the influence and effect of registered nursing on quality of care, patient safety and cost effectiveness.",
  },
  {
    id: "prof_A1.1",
    code: "A1.1",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 103,
    statement: "actively listen, recognise and respond to verbal and non-verbal cues",
  },
  {
    id: "prof_A1.2",
    code: "A1.2",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 104,
    statement: "use prompts and positive verbal and non-verbal reinforcement",
  },
  {
    id: "prof_A1.3",
    code: "A1.3",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 105,
    statement:
      "use appropriate non-verbal communication including touch, eye contact and personal space",
  },
  {
    id: "prof_A1.4",
    code: "A1.4",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 106,
    statement: "make appropriate use of open and closed questioning",
  },
  {
    id: "prof_A1.5",
    code: "A1.5",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 107,
    statement: "use caring conversation techniques",
  },
  {
    id: "prof_A1.6",
    code: "A1.6",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 108,
    statement: "check understanding and use clarification techniques",
  },
  {
    id: "prof_A1.7",
    code: "A1.7",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 109,
    statement: "be aware of own unconscious bias in communication encounters",
  },
  {
    id: "prof_A1.8",
    code: "A1.8",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 110,
    statement: "write accurate, clear, legible records and documentation",
  },
  {
    id: "prof_A1.9",
    code: "A1.9",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 111,
    statement:
      "confidently and clearly present and share verbal and written reports with individuals and groups",
  },
  {
    id: "prof_A1.10",
    code: "A1.10",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 112,
    statement: "analyse and clearly record and share digital information and data",
  },
  {
    id: "prof_A1.11",
    code: "A1.11",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 113,
    statement:
      "provide clear verbal, digital or written information and instructions when delegating or handing over responsibility for care",
  },
  {
    id: "prof_A1.12",
    code: "A1.12",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 114,
    statement:
      "recognise the need for, and facilitate access to, translator services and material.",
  },
  {
    id: "prof_A2.1",
    code: "A2.1",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 115,
    statement:
      "share information and check understanding about the causes, implications and treatment of a range of common health conditions including anxiety, depression, memory loss, diabetes, dementia, respiratory disease, cardiac disease, neurological disease, cancer, skin problems, immune deficiencies, psychosis, stroke and arthritis",
  },
  {
    id: "prof_A2.2",
    code: "A2.2",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 116,
    statement:
      "use clear language and appropriate written materials, making reasonable adjustments where appropriate in order to optimise people’s understanding of what has caused their health condition and the implications of their care and treatment",
  },
  {
    id: "prof_A2.3",
    code: "A2.3",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 117,
    statement: "recognise and accommodate sensory impairments during all communications",
  },
  {
    id: "prof_A2.4",
    code: "A2.4",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 118,
    statement: "support and manage the use of personal communication aids",
  },
  {
    id: "prof_A2.5",
    code: "A2.5",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 119,
    statement: "identify the need for and manage a range of alternative communication techniques",
  },
  {
    id: "prof_A2.6",
    code: "A2.6",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 120,
    statement: "use repetition and positive reinforcement strategies",
  },
  {
    id: "prof_A2.7",
    code: "A2.7",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 121,
    statement:
      "assess motivation and capacity for behaviour change and clearly explain cause and effect relationships related to common health risk behaviours including smoking, obesity, sexual practice, alcohol and substance use",
  },
  {
    id: "prof_A2.8",
    code: "A2.8",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 122,
    statement:
      "provide information and explanation to people, families and carers and respond to questions about their treatment and care and possible ways of preventing ill health to enhance understanding",
  },
  {
    id: "prof_A2.9",
    code: "A2.9",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 123,
    statement:
      "engage in difficult conversations, including breaking bad news, and support people who are feeling emotionally or physically vulnerable or in distress, conveying compassion and sensitivity.",
  },
  {
    id: "prof_A3.1",
    code: "A3.1",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 124,
    statement: "motivational interview techniques",
  },
  {
    id: "prof_A3.2",
    code: "A3.2",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 125,
    statement: "solution focused therapies",
  },
  {
    id: "prof_A3.3",
    code: "A3.3",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 126,
    statement: "reminiscence therapies",
  },
  {
    id: "prof_A3.4",
    code: "A3.4",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 127,
    statement: "talking therapies",
  },
  {
    id: "prof_A3.5",
    code: "A3.5",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 128,
    statement: "de-escalation strategies and techniques",
  },
  {
    id: "prof_A3.6",
    code: "A3.6",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 129,
    statement: "cognitive behavioural therapy techniques",
  },
  {
    id: "prof_A3.7",
    code: "A3.7",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 130,
    statement: "play therapy",
  },
  {
    id: "prof_A3.8",
    code: "A3.8",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 131,
    statement: "distraction and diversion strategies",
  },
  {
    id: "prof_A3.9",
    code: "A3.9",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 132,
    statement: "positive behaviour support approaches.",
  },
  {
    id: "prof_A4.1",
    code: "A4.1",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 133,
    statement:
      "Demonstrate effective supervision, teaching and performance appraisal through the use of: 4.1.1 clear instructions and explanations when supervising, teaching or appraising others 4.1.2 clear instructions and check understanding when delegating care responsibilities to others 4.1.3 unambiguous, constructive feedback about strengths and weaknesses and potential for improvement 4.1.4 encouragement to colleagues that helps them to reflect on their practice 4.1.5 unambiguous records of performance",
  },
  {
    id: "prof_A4.2",
    code: "A4.2",
    platform: 0,
    platformTitle: "Annexe A: Communication and relationship management skills",
    annexe: "A",
    orderIndex: 134,
    statement:
      "Demonstrate effective person and team management through the use of: 4.2.1 strengths-based approaches to developing teams and managing change 4.2.2 active listening when dealing with team members’ concerns and anxieties 4.2.3 a calm presence when dealing with conflict 4.2.4 appropriate and effective confrontation strategies 4.2.5 de-escalation strategies and techniques when dealing with conflict 4.2.6 effective coordination and navigation skills through: 4.2.6.1 appropriate negotiation strategies 4.2.6.2 appropriate escalation procedures 4.2.6.3 appropriate approaches to advocacy.",
  },
  {
    id: "prof_B1.1",
    code: "B1.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 135,
    statement:
      "mental health and wellbeing status 1.1.1 signs of mental and emotional distress or vulnerability 1.1.2 cognitive health status and wellbeing 1.1.3 signs of cognitive distress and impairment 1.1.4 behavioural distress based needs 1.1.5 signs of mental and emotional distress including agitation, aggression and challenging behaviour 1.1.6 signs of self-harm and/or suicidal ideation",
  },
  {
    id: "prof_B1.2",
    code: "B1.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 136,
    statement:
      "physical health and wellbeing 1.2.1 symptoms and signs of physical ill health 1.2.2 symptoms and signs of physical distress 1.2.3 symptoms and signs of deterioration and sepsis.",
  },
  {
    id: "prof_B2.1",
    code: "B2.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 137,
    statement: "take, record and interpret vital signs manually and via technological devices",
  },
  {
    id: "prof_B2.2",
    code: "B2.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 138,
    statement:
      "undertake venepuncture and cannulation and blood sampling, interpreting normal and common abnormal blood profiles and venous blood gases",
  },
  {
    id: "prof_B2.3",
    code: "B2.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 139,
    statement:
      "set up and manage routine electrocardiogram (ECG) investigations and interpret normal and commonly encountered abnormal traces",
  },
  {
    id: "prof_B2.4",
    code: "B2.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 140,
    statement: "manage and monitor blood component transfusions",
  },
  {
    id: "prof_B2.5",
    code: "B2.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 141,
    statement:
      "manage and interpret cardiac monitors, infusion pumps, blood glucose monitors and other monitoring devices",
  },
  {
    id: "prof_B2.6",
    code: "B2.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 142,
    statement:
      "accurately measure weight and height, calculate body mass index and recognise healthy ranges and clinically significant low/high readings",
  },
  {
    id: "prof_B2.7",
    code: "B2.7",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 143,
    statement:
      "undertake a whole body systems assessment including respiratory, circulatory, neurological, musculoskeletal, cardiovascular and skin status",
  },
  {
    id: "prof_B2.8",
    code: "B2.8",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 144,
    statement: "undertake chest auscultation and interpret findings",
  },
  {
    id: "prof_B2.9",
    code: "B2.9",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 145,
    statement:
      "collect and observe sputum, urine, stool and vomit specimens, undertaking routine analysis and interpreting findings",
  },
  {
    id: "prof_B2.10",
    code: "B2.10",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 146,
    statement: "measure and interpret blood glucose levels",
  },
  {
    id: "prof_B2.11",
    code: "B2.11",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 147,
    statement: "recognise and respond to signs of all forms of abuse",
  },
  {
    id: "prof_B2.12",
    code: "B2.12",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 148,
    statement: "undertake, respond to and interpret neurological observations and assessments",
  },
  {
    id: "prof_B2.13",
    code: "B2.13",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 149,
    statement: "identify and respond to signs of deterioration and sepsis",
  },
  {
    id: "prof_B2.14",
    code: "B2.14",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 150,
    statement: "administer basic mental health first aid",
  },
  {
    id: "prof_B2.15",
    code: "B2.15",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 151,
    statement: "administer basic physical first aid",
  },
  {
    id: "prof_B2.16",
    code: "B2.16",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 152,
    statement:
      "recognise and manage seizures, choking and anaphylaxis, providing appropriate basic life support",
  },
  {
    id: "prof_B2.17",
    code: "B2.17",
    platform: 0,
    platformTitle:
      "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care",
    annexe: "B",
    orderIndex: 153,
    statement:
      "recognise and respond to challenging behaviour, providing appropriate safe holding and restraint.",
  },
  {
    id: "prof_B3.1",
    code: "B3.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 154,
    statement: "observe and assess comfort and pain levels and rest and sleep patterns",
  },
  {
    id: "prof_B3.2",
    code: "B3.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 155,
    statement:
      "use appropriate bed-making techniques including those required for people who are unconscious or who have limited mobility",
  },
  {
    id: "prof_B3.3",
    code: "B3.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 156,
    statement: "use appropriate positioning and pressure-relieving techniques",
  },
  {
    id: "prof_B3.4",
    code: "B3.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 157,
    statement: "take appropriate action to ensure privacy and dignity at all times",
  },
  {
    id: "prof_B3.5",
    code: "B3.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 158,
    statement: "take appropriate action to reduce or minimise pain or discomfort",
  },
  {
    id: "prof_B3.6",
    code: "B3.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 159,
    statement:
      "take appropriate action to reduce fatigue, minimise insomnia and support improved rest and sleep hygiene.",
  },
  {
    id: "prof_B4.1",
    code: "B4.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 160,
    statement:
      "observe, assess and optimise skin and hygiene status and determine the need for support and intervention",
  },
  {
    id: "prof_B4.2",
    code: "B4.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 161,
    statement:
      "use contemporary approaches to the assessment of skin integrity and use appropriate products to prevent or manage skin breakdown",
  },
  {
    id: "prof_B4.3",
    code: "B4.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 162,
    statement:
      "assess needs for and provide appropriate assistance with washing, bathing, shaving and dressing",
  },
  {
    id: "prof_B4.4",
    code: "B4.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 163,
    statement: "identify and manage skin irritations and rashes",
  },
  {
    id: "prof_B4.5",
    code: "B4.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 164,
    statement:
      "assess needs for and provide appropriate oral, dental, eye and nail care and decide when an onward referral is needed",
  },
  {
    id: "prof_B4.6",
    code: "B4.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 165,
    statement:
      "use aseptic techniques when undertaking wound care including dressings, pressure bandaging, suture removal, and vacuum closures",
  },
  {
    id: "prof_B4.7",
    code: "B4.7",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 166,
    statement: "use aseptic techniques when managing wound and drainage processes",
  },
  {
    id: "prof_B4.8",
    code: "B4.8",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 167,
    statement: "assess, respond and effectively manage pyrexia and hypothermia.",
  },
  {
    id: "prof_B5.1",
    code: "B5.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 168,
    statement:
      "observe, assess and optimise nutrition and hydration status and determine the need for intervention and support",
  },
  {
    id: "prof_B5.2",
    code: "B5.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 169,
    statement: "use contemporary nutritional assessment tools",
  },
  {
    id: "prof_B5.3",
    code: "B5.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 170,
    statement: "assist with feeding and drinking and use appropriate feeding and drinking aids",
  },
  {
    id: "prof_B5.4",
    code: "B5.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 171,
    statement:
      "record fluid intake and output and identify, respond to and manage dehydration or fluid retention",
  },
  {
    id: "prof_B5.5",
    code: "B5.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 172,
    statement: "identify, respond to and manage nausea and vomiting",
  },
  {
    id: "prof_B5.6",
    code: "B5.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 173,
    statement: "insert, manage and remove oral/nasal/gastric tubes",
  },
  {
    id: "prof_B5.7",
    code: "B5.7",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 174,
    statement:
      "manage artificial nutrition and hydration using oral, enteral and parenteral routes",
  },
  {
    id: "prof_B5.8",
    code: "B5.8",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 175,
    statement: "manage the administration of IV fluids",
  },
  {
    id: "prof_B5.9",
    code: "B5.9",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 176,
    statement: "manage fluid and nutritional infusion pumps and devices.",
  },
  {
    id: "prof_B6.1",
    code: "B6.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 177,
    statement:
      "observe and assess level of urinary and bowel continence to determine the need for support and intervention assisting with toileting, maintaining dignity and privacy and managing the use of appropriate aids",
  },
  {
    id: "prof_B6.2",
    code: "B6.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 178,
    statement:
      "select and use appropriate continence products; insert, manage and remove catheters for all genders; and assist with self-catheterisation when required",
  },
  {
    id: "prof_B6.3",
    code: "B6.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 179,
    statement: "manage bladder drainage",
  },
  {
    id: "prof_B6.4",
    code: "B6.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 180,
    statement:
      "assess bladder and bowel patterns to identify and respond to constipation, diarrhoea and urinary and faecal retention",
  },
  {
    id: "prof_B6.5",
    code: "B6.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 181,
    statement:
      "administer enemas and suppositories and undertake rectal examination and manual evacuation when appropriate",
  },
  {
    id: "prof_B6.6",
    code: "B6.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 182,
    statement: "undertake stoma care identifying and using appropriate products and approaches.",
  },
  {
    id: "prof_B7.1",
    code: "B7.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 183,
    statement:
      "observe and use evidence-based risk assessment tools to determine need for support and intervention to optimise mobility and safety, and to identify and manage risk of falls using best practice risk assessment approaches",
  },
  {
    id: "prof_B7.2",
    code: "B7.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 184,
    statement: "use a range of contemporary moving and handling techniques and mobility aids",
  },
  {
    id: "prof_B7.3",
    code: "B7.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 185,
    statement:
      "use appropriate moving and handling equipment to support people with impaired mobility",
  },
  {
    id: "prof_B7.4",
    code: "B7.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 186,
    statement: "use appropriate safety techniques and devices.",
  },
  {
    id: "prof_B8.1",
    code: "B8.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 187,
    statement:
      "observe and assess the need for intervention and respond to restlessness, agitation and breathlessness using appropriate interventions",
  },
  {
    id: "prof_B8.2",
    code: "B8.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 188,
    statement:
      "manage the administration of oxygen using a range of routes and best practice approaches",
  },
  {
    id: "prof_B8.3",
    code: "B8.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 189,
    statement: "take and interpret peak flow and oximetry measurements",
  },
  {
    id: "prof_B8.4",
    code: "B8.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 190,
    statement: "use appropriate nasal and oral suctioning techniques",
  },
  {
    id: "prof_B8.5",
    code: "B8.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 191,
    statement: "manage inhalation, humidifier and nebuliser devices",
  },
  {
    id: "prof_B8.6",
    code: "B8.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 192,
    statement: "manage airway and respiratory processes and equipment.",
  },
  {
    id: "prof_B9.1",
    code: "B9.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 193,
    statement:
      "observe, assess and respond rapidly to potential infection risks using best practice guidelines",
  },
  {
    id: "prof_B9.2",
    code: "B9.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 194,
    statement: "use standard precautions protocols",
  },
  {
    id: "prof_B9.3",
    code: "B9.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 195,
    statement: "use effective aseptic, non-touch techniques",
  },
  {
    id: "prof_B9.4",
    code: "B9.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 196,
    statement: "use appropriate personal protection equipment",
  },
  {
    id: "prof_B9.5",
    code: "B9.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 197,
    statement: "implement isolation procedures",
  },
  {
    id: "prof_B9.6",
    code: "B9.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 198,
    statement: "use evidence-based hand hygiene techniques",
  },
  {
    id: "prof_B9.7",
    code: "B9.7",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 199,
    statement: "safely decontaminate equipment and environment",
  },
  {
    id: "prof_B9.8",
    code: "B9.8",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 200,
    statement: "safely use and dispose of waste, laundry and sharps",
  },
  {
    id: "prof_B9.9",
    code: "B9.9",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 201,
    statement: "safely assess and manage invasive medical devices and lines.",
  },
  {
    id: "prof_B10.1",
    code: "B10.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 202,
    statement:
      "observe and assess the need for intervention for people, families and carers, identify, assess and respond appropriately to uncontrolled symptoms and signs of distress including pain, nausea, thirst, constipation, restlessness, agitation, anxiety and depression",
  },
  {
    id: "prof_B10.2",
    code: "B10.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 203,
    statement:
      "manage and monitor effectiveness of symptom relief medication, infusion pumps and other devices",
  },
  {
    id: "prof_B10.3",
    code: "B10.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 204,
    statement:
      "assess and review preferences and care priorities of the dying person and their family and carers",
  },
  {
    id: "prof_B10.4",
    code: "B10.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 205,
    statement:
      "understand and apply organ and tissue donation protocols, advanced planning decisions, living wills and health and lasting powers of attorney for health",
  },
  {
    id: "prof_B10.5",
    code: "B10.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 206,
    statement:
      "understand and apply DNACPR (do not attempt cardiopulmonary resuscitation) decisions and verification of expected death",
  },
  {
    id: "prof_B10.6",
    code: "B10.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 207,
    statement:
      "provide care for the deceased person and the bereaved, respecting cultural requirements and protocols.",
  },
  {
    id: "prof_B11.1",
    code: "B11.1",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 208,
    statement:
      "carry out initial and continued assessments of people receiving care and their ability to self-administer their own medications",
  },
  {
    id: "prof_B11.2",
    code: "B11.2",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 209,
    statement:
      "recognise the various procedural routes under which medicines can be prescribed, supplied, dispensed and administered; and the laws, policies, regulations and guidance that underpin them",
  },
  {
    id: "prof_B11.3",
    code: "B11.3",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 210,
    statement:
      "use the principles of safe remote prescribing and directions to administer medicines",
  },
  {
    id: "prof_B11.4",
    code: "B11.4",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 211,
    statement: "undertake accurate drug calculations for a range of medications",
  },
  {
    id: "prof_B11.5",
    code: "B11.5",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 212,
    statement:
      "undertake accurate checks, including transcription and titration, of any direction to supply or administer a medicinal product",
  },
  {
    id: "prof_B11.6",
    code: "B11.6",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 213,
    statement:
      "exercise professional accountability in ensuring the safe administration of medicines to those receiving care",
  },
  {
    id: "prof_B11.7",
    code: "B11.7",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 214,
    statement:
      "administer injections using intramuscular, subcutaneous, intradermal and intravenous routes and manage injection equipment",
  },
  {
    id: "prof_B11.8",
    code: "B11.8",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 215,
    statement: "administer medications using a range of routes",
  },
  {
    id: "prof_B11.9",
    code: "B11.9",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 216,
    statement:
      "administer and monitor medications using vascular access devices and enteral equipment",
  },
  {
    id: "prof_B11.10",
    code: "B11.10",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 217,
    statement: "recognise and respond to adverse or abnormal reactions to medications",
  },
  {
    id: "prof_B11.11",
    code: "B11.11",
    platform: 0,
    platformTitle:
      "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care",
    annexe: "B",
    orderIndex: 218,
    statement: "undertake safe storage, transportation and disposal of medicinal products.",
  },
];
