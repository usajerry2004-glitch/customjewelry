// Fixed CAD Person roster for the upload forms — kept as a dropdown instead
// of free text so the same person isn't logged under multiple spellings
// across CAD files and the Monthly Production Report's per-person breakdown.
export const CAD_PERSON_OTHER = '__OTHER__';

export const CAD_PERSON_OPTIONS: { value: string; label: string }[] = [
  { value: 'Abhishek', label: 'Abhishek' },
  { value: CAD_PERSON_OTHER, label: 'Other' },
  { value: 'Dharmedra', label: 'Dharmedra' },
  { value: 'Ganesh', label: 'Ganesh' },
  { value: 'HARSH', label: 'HARSH' },
  { value: 'Harshal', label: 'Harshal' },
  { value: 'Kashinath', label: 'Kashinath' },
  { value: 'Manoj', label: 'Manoj' },
  { value: 'Neha', label: 'Neha' },
  { value: 'Prabhita', label: 'Prabhita' },
  { value: 'Sahil', label: 'Sahil' },
  { value: 'Sayali Takke', label: 'Sayali Takke' },
  { value: 'Siddharth', label: 'Siddharth' },
  { value: 'Siddhesh', label: 'Siddhesh' },
];
