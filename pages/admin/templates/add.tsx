import { Title } from "@mantine/core";
import type { NextPage } from "next";
import ContractForm from "../../../components/contracts/ContractForm";

const AddContract: NextPage = () => {
  return (
    <>
      <Title order={1}>Create New Contract</Title>
      <ContractForm previousValues={undefined}></ContractForm>
    </>
  )
}

export default AddContract