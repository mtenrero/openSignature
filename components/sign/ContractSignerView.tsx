import { useForm, UseFormReturnType } from "@mantine/form";
import { ContractCard } from "./ContractCard";

export interface ContractSignerViewProps {
  template: object,
  contractData: object
  form: UseFormReturnType<Record<string, unknown>>
}

export default ({template, contractData}: ContractSignerViewProps) => {

  const form = useForm()

  return (
    <div>
      <ContractCard
        title={template['name'] || ""} 
        description={template['description'] || ""}
        template={template}
        contractData={contractData}
        form={form}
      />
    </div>
  );
}