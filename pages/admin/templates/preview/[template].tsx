import { Center, Title, Space } from "@mantine/core";
import axios from "axios";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import ContractSignerView from "../../../../components/sign/ContractSignerView";

interface TemplatePreviewProps {
  templateData: object
}

export default ({templateData}: TemplatePreviewProps) => {
  const router = useRouter()

  const [template, setTemplate] = useState(null)

  useEffect(() => {
    const fetch = async () => {
      axios.get(`/api/templates/${router.query.template}`).then(res => 
        setTemplate(res.data)
      )
    }
    if (router.query.template) {
      fetch()
    }
  }, [router.query])

  if (!template) {return "LOADING..."} 

  return (
    <div>
      <Center>
        <Title color={"red"} order={1}>- This is a preview of the Template -</Title>
      </Center>
      <p></p>
      <ContractSignerView template={template} contractData={{}}/>
    </div>
  );
}