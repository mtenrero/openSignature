import { ContractCard } from "./ContractCard";

export interface ContractSignerViewProps {
  template: object,
  contractData: object
}

export default ({template, contractData}: ContractSignerViewProps) => {


  return (
    <div>
      <ContractCard
        title={template['name'] || ""} 
        description={template['description'] || ""}
        template={template}
        contractData={contractData}
      />
    </div>
  );
}