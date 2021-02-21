import useField from '../hooks/field';

export default function Field({render, ...props}) {
  const field = useField(props);
  return render(field);
}
